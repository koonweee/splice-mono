const USER = '10000000-0000-4000-8000-000000000001';

// Deliberately non-default siblings make an accidental whole-JSON overwrite visible.
const INITIAL_SETTINGS = {
  currency: 'USD',
  timezone: 'America/Los_Angeles',
  hideZeroBalanceAccounts: false,
  theme: 'oled-black',
  neutralizationLookaroundDays: 17,
  analysisSankeyEnabled: true,
  notifications: {
    transactions: { newSyncedTransactions: true },
    bankLinks: { needsAttention: true },
  },
};

function canonicalSettings(settings) {
  return JSON.stringify({
    currency: settings.currency,
    timezone: settings.timezone,
    hideZeroBalanceAccounts: settings.hideZeroBalanceAccounts,
    theme: settings.theme,
    neutralizationLookaroundDays: settings.neutralizationLookaroundDays,
    analysisSankeyEnabled: settings.analysisSankeyEnabled,
    notifications: {
      transactions: {
        newSyncedTransactions:
          settings.notifications?.transactions?.newSyncedTransactions,
      },
      bankLinks: {
        needsAttention: settings.notifications?.bankLinks?.needsAttention,
      },
    },
  });
}

/**
 * Service-only PAT validation and parallel real settings writes at the 10k fixture.
 * The runner owns 5 warmups / 100 calls / 3 processes. setup resets database state
 * before every preflight, warmup and measured call, outside the timed interval.
 * These PAT measurements do not cover JWT/Auth0 or establish revocation safety.
 */
function authSettingsWorkloads(database, services) {
  const cases = [];
  // The immutable before/after service adapters already expose this contract flag.
  const finalImplementation = services.stringMoney;
  let token;
  let identity;

  async function ensureToken() {
    if (token) return;
    identity = await services.repo.users.findOne({
      where: { id: USER },
      select: { id: true, email: true },
    });
    if (!identity) throw new Error('PAT benchmark fixture user is missing');
    token = await services.pat.createToken(
      { userId: identity.id, email: identity.email },
      { name: 'Synthetic isolated PAT benchmark', expiresAt: null },
    );
  }

  for (const usageDue of [false, true]) {
    let resetState;
    cases.push({
      name: `auth-settings.pat.${usageDue ? 'usage-due' : 'recent-use'}`,
      layer: 'pat-service+postgres',
      policy: 'pat-usage-write-coalescing',
      setup: async () => {
        await ensureToken();
        // PostgreSQL time is intentional: the final usage window uses its clock.
        // The baseline JS clock is fixed by the runner, so verify transitions,
        // not timestamp ordering or exact before/after timestamp equality.
        const [rows, affected] = await database.query(
          `UPDATE personal_access_token
           SET "revokedAt"=NULL,"expiresAt"=NULL,
               "lastUsedAt"=CASE WHEN $2::boolean THEN NULL ELSE clock_timestamp()-interval '5 seconds' END,
               "updatedAt"='2000-01-01T00:00:00Z'::timestamp
           WHERE id=$1 RETURNING xmin::text AS version,"lastUsedAt"::text AS "lastUsedAt"`,
          [token.id, usageDue],
        );
        resetState = rows[0];
        if (affected !== 1 || !resetState)
          throw new Error('PAT benchmark reset missed its row');
      },
      call: async () => {
        const result = await services.pat.validateToken(token.token);
        if (
          !result ||
          result.userId !== identity.id ||
          result.email !== identity.email
        )
          throw new Error(
            'PAT validation did not return the expected identity',
          );
        // Never serialize a raw token, token hash, random token id or timestamps.
        return { authenticated: true, expectedIdentity: true };
      },
      verify: async () => {
        const [stored] = await database.query(
          `SELECT xmin::text AS version,"lastUsedAt"::text AS "lastUsedAt",
                  "revokedAt" IS NULL AS active,"expiresAt" IS NULL AS unexpired
           FROM personal_access_token WHERE id=$1`,
          [token.id],
        );
        if (
          !stored ||
          !stored.active ||
          !stored.unexpired ||
          !stored.lastUsedAt
        )
          throw new Error(
            'PAT benchmark usage verification found invalid state',
          );
        // A row lock can alter xmax; xmin changes only if an actual tuple update
        // occurred. This also sees the final WITH ... UPDATE ... SELECT CTE,
        // which a counter of SQL strings beginning with UPDATE cannot count.
        const physicallyUpdatedRows =
          stored.version !== resetState.version ? 1 : 0;
        const lastUsedAtChanged = stored.lastUsedAt !== resetState.lastUsedAt;
        const expectedWrite = usageDue || !finalImplementation;
        if (
          physicallyUpdatedRows !== Number(expectedWrite) ||
          lastUsedAtChanged !== expectedWrite
        )
          throw new Error('PAT usage-write behavior does not match its policy');
        return {
          authenticated: true,
          expectedIdentity: true,
          usageDue,
          physicallyUpdatedRows,
          lastUsedAtChanged,
          verification:
            'First measured call; token xmin and lastUsedAt read after timing',
          writeAccounting:
            'Physical tuple transition is authoritative; top-level SQL write counts omit writes inside WITH',
          scope:
            'PAT usage-write coalescing only; revocation security has separate race tests; standalone Auth0 MCP is unrelated',
        };
      },
    });
  }

  const patches = [
    {
      name: 'parallel-disjoint',
      left: { currency: 'EUR' },
      right: { hideZeroBalanceAccounts: true },
      expectedLeft: { ...INITIAL_SETTINGS, currency: 'EUR' },
      expectedRight: { ...INITIAL_SETTINGS, hideZeroBalanceAccounts: true },
      expectedBoth: {
        ...INITIAL_SETTINGS,
        currency: 'EUR',
        hideZeroBalanceAccounts: true,
      },
    },
    {
      name: 'parallel-nested',
      left: {
        notifications: { transactions: { newSyncedTransactions: false } },
      },
      right: { notifications: { bankLinks: { needsAttention: false } } },
      expectedLeft: {
        ...INITIAL_SETTINGS,
        notifications: {
          ...INITIAL_SETTINGS.notifications,
          transactions: { newSyncedTransactions: false },
        },
      },
      expectedRight: {
        ...INITIAL_SETTINGS,
        notifications: {
          ...INITIAL_SETTINGS.notifications,
          bankLinks: { needsAttention: false },
        },
      },
      expectedBoth: {
        ...INITIAL_SETTINGS,
        notifications: {
          transactions: { newSyncedTransactions: false },
          bankLinks: { needsAttention: false },
        },
      },
    },
  ];

  for (const patch of patches) {
    const left = canonicalSettings(patch.expectedLeft);
    const right = canonicalSettings(patch.expectedRight);
    const both = canonicalSettings(patch.expectedBoth);
    // The validation object retains this counter by reference, so the runner's
    // first-call verify captures outcomes from all later calls as well. Counts
    // include preflight and warmups, explicitly separate from measured latency.
    const observations = { pairs: 0, preservedPairs: 0, lostUpdatePairs: 0 };
    cases.push({
      name: `auth-settings.settings.${patch.name}`,
      layer: 'parallel-settings-service+postgres+final-readback',
      policy: 'atomic-settings-patch-correction',
      setup: async () => {
        const result = await database.query(
          `UPDATE user_entity SET settings=$2::jsonb WHERE id=$1 RETURNING id`,
          [USER, JSON.stringify(INITIAL_SETTINGS)],
        );
        // TypeORM raw UPDATE returns [records, affected], unlike SELECT.
        if (result[1] !== 1)
          throw new Error('Settings benchmark reset missed its fixture user');
      },
      call: async () => {
        // Do not inject repository barriers or serialize these calls in the
        // harness: exercise actual pool scheduling and the service's row locks.
        const responses = await Promise.all([
          services.user.updateSettings(USER, patch.left),
          services.user.updateSettings(USER, patch.right),
        ]);
        if (responses.some((response) => response === null))
          throw new Error('Settings patch did not find its fixture user');
        const row = await services.repo.users.findOne({
          where: { id: USER },
          select: { id: true, settings: true },
        });
        if (!row)
          throw new Error('Settings fixture disappeared after patching');
        const actual = canonicalSettings(row.settings);
        const preserved = actual === both;
        // Baseline races may preserve both or lose exactly one patch. Never
        // classify arbitrary JSON damage or lost unrelated siblings as expected.
        if (
          !preserved &&
          (finalImplementation || (actual !== left && actual !== right))
        )
          throw new Error('Settings patches lost an unexpected key or value');
        observations.pairs++;
        observations.preservedPairs += Number(preserved);
        observations.lostUpdatePairs += Number(!preserved);
        return {
          patchCount: 2,
          bothPatchesPreserved: preserved,
          outcome: preserved ? 'both-preserved' : 'baseline-lost-update',
          settings: JSON.parse(actual),
        };
      },
      verify: async (result) => ({
        firstMeasuredOutcome: result.outcome,
        observations,
        observationScope: 'All calls, including preflight and warmups',
        timingScope:
          'Two simultaneous service writes plus one narrow persisted-settings readback and assertion; reset excluded',
        acceptedBaselineCorrection:
          'One independently submitted patch can be lost; the final implementation must preserve both on every call',
      }),
    });
  }
  return cases;
}

module.exports = { authSettingsWorkloads };
