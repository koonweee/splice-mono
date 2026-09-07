import { FIXTURE_NOW, fixtureUser } from './fixtures'
import { fixtureSchedules, fixtureTokens } from './page-fixtures'
import type { AxiosRequestConfig } from 'axios'
import type {
  Account,
  Category,
  CreatePersonalAccessTokenDto,
  CreatePersonalAccessTokenResponse,
  CreateRecurringManualTransactionScheduleDto,
  PersonalAccessToken,
  RecurringManualTransactionSchedule,
  UpdateRecurringManualTransactionScheduleDto,
} from '../src/api/models'

type Handler = (config: AxiosRequestConfig) => unknown

/** Deterministic monthly preview; the gallery never runs a transaction scheduler. */
function nextOccurrence(schedule: RecurringManualTransactionSchedule) {
  const today = FIXTURE_NOW.slice(0, 10)
  const floor = schedule.startDate > today ? schedule.startDate : today
  const date = new Date(`${floor}T12:00:00Z`)
  for (let offset = 0; offset < 2; offset++) {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + offset
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const candidate = new Date(
      Date.UTC(year, month, Math.min(schedule.dayOfMonth, lastDay)),
    )
      .toISOString()
      .slice(0, 10)
    if (candidate >= floor)
      return schedule.endDate && candidate > schedule.endDate ? null : candidate
  }
  return null
}

export function createSettingsStore({
  empty,
  accounts,
  categories,
}: {
  empty?: boolean
  accounts: Array<Account>
  categories: Array<Category>
}) {
  const schedules = structuredClone(empty ? [] : fixtureSchedules)
  const tokens = structuredClone(empty ? [] : fixtureTokens)
  let sequence = 1
  const reads: Record<string, Handler> = {
    '/recurring-manual-transaction': () =>
      schedules
        .filter((item) => !item.archivedAt)
        .map((item) => ({
          ...item,
          accountName:
            accounts.find((account) => account.id === item.accountId)?.name ??
            null,
          category:
            categories.find((category) => category.id === item.categoryId) ??
            null,
        })),
    '/user/tokens': () => tokens.filter((item) => !item.revokedAt),
  }
  const writes: Record<string, Handler> = {}
  function registerSchedule(item: RecurringManualTransactionSchedule) {
    const path = `/recurring-manual-transaction/${item.id}`
    writes[`PATCH ${path}`] = (config) => {
      const { paused, ...draft } =
        config.data as UpdateRecurringManualTransactionScheduleDto
      Object.assign(item, draft, { updatedAt: FIXTURE_NOW })
      if (paused !== undefined) item.pausedAt = paused ? FIXTURE_NOW : null
      item.nextOccurrenceDate = nextOccurrence(item)
      return item
    }
    writes[`DELETE ${path}`] = () => {
      item.archivedAt = FIXTURE_NOW
    }
    writes[`POST ${path}/pause`] = () => {
      item.pausedAt = FIXTURE_NOW
      return item
    }
    writes[`POST ${path}/resume`] = () => {
      item.pausedAt = null
      item.nextOccurrenceDate = nextOccurrence(item)
      return item
    }
  }
  function registerToken(item: PersonalAccessToken) {
    writes[`DELETE /user/tokens/${item.id}`] = () => {
      item.revokedAt = FIXTURE_NOW
    }
  }
  schedules.forEach(registerSchedule)
  tokens.forEach(registerToken)
  writes['POST /recurring-manual-transaction'] = (config) => {
    const draft = config.data as CreateRecurringManualTransactionScheduleDto
    const item: RecurringManualTransactionSchedule = {
      ...draft,
      id: `schedule-created-${sequence++}`,
      frequency: 'monthly',
      endDate: draft.endDate ?? null,
      nextOccurrenceDate: null,
      lastGeneratedOccurrenceDate: null,
      pausedAt: null,
      archivedAt: null,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
      userId: fixtureUser.id,
    }
    item.nextOccurrenceDate = nextOccurrence(item)
    schedules.push(item)
    registerSchedule(item)
    return item
  }
  writes['POST /user/tokens'] = (config): CreatePersonalAccessTokenResponse => {
    const draft = config.data as CreatePersonalAccessTokenDto
    const item: PersonalAccessToken = {
      id: `token-created-${sequence++}`,
      name: draft.name,
      tokenPreview: 'workbench-only…invalid',
      expiresAt: draft.expiresAt ?? null,
      createdAt: FIXTURE_NOW,
      lastUsedAt: null,
      revokedAt: null,
    }
    tokens.push(item)
    registerToken(item)
    return { ...item, token: `workbench-only-not-a-credential-${item.id}` }
  }
  return { reads, writes }
}
