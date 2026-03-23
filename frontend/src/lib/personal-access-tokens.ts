import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { PersonalAccessToken } from '../api/models'

dayjs.extend(relativeTime)

const MAX_PERSONAL_ACCESS_TOKEN_NAME_LENGTH = 100

export function getActivePersonalAccessTokens(
  tokens: PersonalAccessToken[],
  now = new Date(),
): PersonalAccessToken[] {
  const nowTime = now.getTime()

  return tokens.filter((token) => {
    if (token.revokedAt != null) {
      return false
    }

    if (token.expiresAt == null) {
      return true
    }

    return new Date(token.expiresAt).getTime() > nowTime
  })
}

export function normalizePersonalAccessTokenName(name: string): string {
  const normalizedName = name.trim()

  if (normalizedName.length === 0) {
    throw new Error('Personal access token name cannot be blank.')
  }

  if (normalizedName.length > MAX_PERSONAL_ACCESS_TOKEN_NAME_LENGTH) {
    throw new Error('Personal access token name must be 100 characters or less.')
  }

  return normalizedName
}

export function getPersonalAccessTokenUsageText(
  lastUsedAt: string | Date | null,
): string {
  if (lastUsedAt == null) {
    return 'Never used'
  }

  return `Last used ${dayjs(lastUsedAt).fromNow()}`
}
