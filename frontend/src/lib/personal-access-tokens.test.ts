import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalAccessToken } from '../api/models'
import {
  getActivePersonalAccessTokens,
  getPersonalAccessTokenUsageText,
  normalizePersonalAccessTokenName,
} from './personal-access-tokens'

function makeToken(
  overrides: Partial<PersonalAccessToken> & Pick<PersonalAccessToken, 'id' | 'name'>,
): PersonalAccessToken {
  return {
    tokenPreview: 'splic...abcd',
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: '2026-03-22T00:00:00.000Z',
    ...overrides,
    id: overrides.id,
    name: overrides.name,
  }
}

describe('personal access token helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('filters out revoked and expired tokens', () => {
    const now = new Date('2026-03-22T12:00:00.000Z')
    const activeToken = makeToken({
      id: 'active',
      name: 'Active',
      expiresAt: '2026-03-22T12:30:00.000Z',
    })
    const unexpiredToken = makeToken({
      id: 'unexpired',
      name: 'Unexpired',
      expiresAt: null,
    })
    const revokedToken = makeToken({
      id: 'revoked',
      name: 'Revoked',
      revokedAt: '2026-03-22T11:00:00.000Z',
    })
    const expiredToken = makeToken({
      id: 'expired',
      name: 'Expired',
      expiresAt: '2026-03-22T11:59:59.000Z',
    })

    expect(
      getActivePersonalAccessTokens(
        [revokedToken, expiredToken, activeToken, unexpiredToken],
        now,
      ),
    ).toEqual([activeToken, unexpiredToken])
  })

  it('trims valid names and rejects blank names', () => {
    expect(normalizePersonalAccessTokenName('  codex-local  ')).toBe(
      'codex-local',
    )
    expect(() => normalizePersonalAccessTokenName('   ')).toThrow()
  })

  it('allows names up to 100 characters and rejects 101 characters', () => {
    expect(normalizePersonalAccessTokenName('x'.repeat(100))).toBe(
      'x'.repeat(100),
    )
    expect(() => normalizePersonalAccessTokenName('x'.repeat(101))).toThrow()
  })

  it('formats usage text for never-used and last-used tokens', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T12:00:00.000Z'))

    expect(getPersonalAccessTokenUsageText(null)).toBe('Never used')
    expect(
      getPersonalAccessTokenUsageText('2026-03-22T10:00:00.000Z'),
    ).toBe('Last used 2 hours ago')
  })
})
