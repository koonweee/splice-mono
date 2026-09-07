import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull, MoreThan } from 'typeorm';
import { BrowserSessionEntity } from './browser-session.entity';
import { RefreshTokenEntity } from './refresh-token.entity';

const FAMILY_QUERY = `WITH RECURSIVE family AS (
  SELECT token.* FROM refresh_token token WHERE token.id = $1 AND token."userId" = $2
  UNION
  SELECT token.* FROM refresh_token token JOIN family parent
    ON (token.id = parent."replacedByTokenId" OR token."replacedByTokenId" = parent.id)
    AND token."userId" = parent."userId"
) SELECT * FROM family ORDER BY id`;

/** Low-level transaction boundary shared by auth and push; no feature service imports. */
@Injectable()
export class BrowserSessionService {
  constructor(private readonly dataSource: DataSource) {}

  async lockUser(manager: EntityManager, userId: string): Promise<void> {
    await manager.query(`SET LOCAL lock_timeout = '6s'`);
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`browser-session:${userId}`],
    );
  }

  async createSession(
    manager: EntityManager,
    userId: string,
    expiresAt: Date,
  ): Promise<BrowserSessionEntity> {
    await this.lockUser(manager, userId);
    const repository = manager.getRepository(BrowserSessionEntity);
    return repository.save(
      repository.create({ userId, expiresAt, revokedAt: null }),
    );
  }

  /** Caller must keep this transaction open until enrollment/send has completed. */
  async lockActiveSession(
    manager: EntityManager,
    sessionId: string,
    userId: string,
  ): Promise<BrowserSessionEntity> {
    await manager.query(`SET LOCAL lock_timeout = '6s'`);
    const session = await manager.getRepository(BrowserSessionEntity).findOne({
      where: { id: sessionId, userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Browser session is no longer active');
    }
    return session;
  }

  /** Only call with the refresh cookie, never a body-supplied device/session ID. */
  async resolveForRefreshToken(
    manager: EntityManager,
    rawToken: string,
    userId: string,
  ): Promise<BrowserSessionEntity> {
    const locked = await this.lockRefreshToken(manager, rawToken);
    if (!locked || locked.token.userId !== userId) {
      throw new UnauthorizedException('A browser session is required');
    }
    const { token, session } = locked;
    const now = new Date();
    let valid = !token.revoked && token.expiresAt > now;
    if (
      token.revoked &&
      token.expiresAt > now &&
      token.revocationReason === 'rotated' &&
      token.rotationGraceExpiresAt &&
      token.rotationGraceExpiresAt >= now &&
      token.replacedByTokenId
    ) {
      const replacement = await manager
        .getRepository(RefreshTokenEntity)
        .findOneBy({
          id: token.replacedByTokenId,
          userId,
          sessionId: session.id,
        });
      valid =
        !!replacement && !replacement.revoked && replacement.expiresAt > now;
    }
    if (!valid || session.revokedAt || session.expiresAt <= now) {
      throw new UnauthorizedException('Browser session is no longer active');
    }
    return session;
  }

  /**
   * User advisory lock -> existing session -> refresh family rows. Old binaries
   * can still append an unbound replacement while being drained. Re-read the
   * graph after acquiring row locks, then attach every new descendant before
   * continuing. Token links, never user identity alone, define a family.
   */
  async lockRefreshToken(
    manager: EntityManager,
    rawToken: string,
  ): Promise<{
    token: RefreshTokenEntity;
    session: BrowserSessionEntity;
  } | null> {
    const repository = manager.getRepository(RefreshTokenEntity);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const initial = await repository.findOneBy({ token: tokenHash });
    if (!initial) return null;
    return this.lockTokenFamily(manager, initial);
  }

  /** Bounded reconciliation for the final drain gate; no raw credentials needed. */
  async backfillUnboundSessions(limit = 100): Promise<number> {
    const candidates = await this.dataSource
      .getRepository(RefreshTokenEntity)
      .find({
        where: {
          sessionId: IsNull(),
          revoked: false,
          expiresAt: MoreThan(new Date()),
        },
        order: { id: 'ASC' },
        take: Math.max(1, Math.min(limit, 500)),
      });
    let reconciled = 0;
    for (const token of candidates) {
      const result = await this.dataSource.transaction((manager) =>
        this.lockTokenFamily(manager, token),
      );
      if (result) reconciled++;
    }
    return reconciled;
  }

  private async lockTokenFamily(
    manager: EntityManager,
    initial: RefreshTokenEntity,
  ): Promise<{
    token: RefreshTokenEntity;
    session: BrowserSessionEntity;
  } | null> {
    const repository = manager.getRepository(RefreshTokenEntity);
    await this.lockUser(manager, initial.userId);

    let family = await manager.query<RefreshTokenEntity[]>(FAMILY_QUERY, [
      initial.id,
      initial.userId,
    ]);
    if (family.length === 0) return null;
    const sessionIds = [
      ...new Set(
        family.flatMap((token) => (token.sessionId ? [token.sessionId] : [])),
      ),
    ];
    if (sessionIds.length > 1)
      throw new UnauthorizedException('Invalid browser session family');
    const sessions = manager.getRepository(BrowserSessionEntity);
    let session = sessionIds[0]
      ? await sessions.findOne({
          where: { id: sessionIds[0], userId: initial.userId },
          lock: { mode: 'pessimistic_write' },
        })
      : null;
    if (sessionIds.length && !session)
      throw new UnauthorizedException('Invalid browser session');

    let stable = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const ids = family.map((token) => token.id);
      await repository.find({
        where: { id: In(ids) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      family = await manager.query<RefreshTokenEntity[]>(FAMILY_QUERY, [
        initial.id,
        initial.userId,
      ]);
      if (family.every((token) => ids.includes(token.id))) {
        stable = true;
        break;
      }
    }
    if (!stable)
      throw new UnauthorizedException('Session changed; retry the request');
    const token = family.find((member) => member.id === initial.id);
    if (!token) return null;
    const now = new Date();
    const live = family.filter(
      (member) => !member.revoked && member.expiresAt > now,
    );
    const expiresAt = new Date(
      Math.max(...family.map((member) => member.expiresAt.getTime())),
    );
    if (!session) {
      session = await sessions.save(
        sessions.create({
          userId: initial.userId,
          expiresAt,
          revokedAt: live.length ? null : now,
        }),
      );
    } else if (!session.revokedAt && expiresAt > session.expiresAt) {
      session.expiresAt = expiresAt;
      await sessions.save(session);
    }
    await repository.update(
      { id: In(family.map((member) => member.id)) },
      { sessionId: session.id },
    );
    token.sessionId = session.id;
    return { token, session };
  }

  async extendSession(
    manager: EntityManager,
    session: BrowserSessionEntity,
    expiresAt: Date,
  ): Promise<void> {
    session.expiresAt = expiresAt;
    await manager.getRepository(BrowserSessionEntity).save(session);
  }

  async revokeToken(rawToken: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockRefreshToken(manager, rawToken);
      if (!locked) return;
      await this.revokeSessions(
        manager,
        locked.token.userId,
        [locked.session.id],
        'logout',
      );
    });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const sessions = await manager.getRepository(BrowserSessionEntity).find({
        where: { userId },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      await this.revokeSessions(
        manager,
        userId,
        sessions.map((session) => session.id),
        'logout_all',
      );
    });
  }

  private async revokeSessions(
    manager: EntityManager,
    userId: string,
    sessionIds: string[],
    reason: 'logout' | 'logout_all',
  ): Promise<void> {
    const all = reason === 'logout_all';
    const now = new Date();
    if (sessionIds.length) {
      await manager
        .getRepository(BrowserSessionEntity)
        .update({ id: In(sessionIds), userId }, { revokedAt: now });
    }
    // Keep replacement links for family resolution during compatibility rollout.
    // Clearing them can detach an old instance's unbound descendant.
    await manager
      .getRepository(RefreshTokenEntity)
      .update(all ? { userId } : { userId, sessionId: In(sessionIds) }, {
        revoked: true,
        revokedAt: now,
        revocationReason: reason,
        rotationGraceExpiresAt: null,
      });
    // Subscription locks follow session locks; sends use the same ordering.
    const subscriptions = await manager.query<{ id: string }[]>(
      `SELECT id FROM push_subscription_entity WHERE "userId" = $1
       AND ($2::boolean OR "sessionId" = ANY($3::uuid[])) ORDER BY id FOR UPDATE`,
      [userId, all, sessionIds],
    );
    if (!subscriptions.length) return;
    const ids = subscriptions.map((subscription) => subscription.id);
    await manager.query(
      `UPDATE push_subscription_entity SET "revokedAt" = $2::timestamptz, "rebindRequired" = false,
       "enrollmentId" = uuid_generate_v4(), "updatedAt" = $2::timestamptz WHERE id = ANY($1::uuid[])`,
      [ids, now],
    );
    await manager.query(
      `UPDATE notification_push_delivery_entity SET status = 'failed', "lastError" = 'session_revoked',
       "processingStartedAt" = NULL, "updatedAt" = $2
       WHERE "subscriptionId" = ANY($1::uuid[]) AND status IN ('pending', 'processing')`,
      [ids, now],
    );
  }
}
