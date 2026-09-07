import { AxiosError, AxiosHeaders } from 'axios'
import { FIXTURE_NOW } from './fixtures'
import type {
  BulkCategoryActionResponse,
  BulkCustomCategoryActionDto,
  Category,
  CreateCustomCategoryDto,
  Transaction,
  UpdateCustomCategoryDto,
} from '../src/api/models'

const clean = (value: string) => value.trim().replace(/\s+/g, ' ')

/** Shared objects let category edits appear in subsequent transaction responses. */
export function createCategoryStore(
  categories: Array<Category>,
  transactions: Array<Transaction>,
) {
  let sequence = 1
  const conflict = (primary: string, detailed: string, id?: string) =>
    categories.find(
      (item) =>
        item.id !== id &&
        clean(item.primary).toLowerCase() === clean(primary).toLowerCase() &&
        clean(item.detailed).toLowerCase() === clean(detailed).toLowerCase(),
    )
  function rejectConflict(item: Category) {
    throw new AxiosError(
      'Category already exists',
      'ERR_BAD_RESPONSE',
      undefined,
      undefined,
      {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          message: 'Category already exists',
          category: {
            ...item,
            categoryId: item.id,
            label: `${item.primary} > ${item.detailed}`,
          },
        },
      },
    )
  }
  function create(draft: CreateCustomCategoryDto) {
    const existing = conflict(draft.primary, draft.detailed)
    if (existing) rejectConflict(existing)
    const category: Category = {
      id: `category-created-${sequence++}`,
      primary: clean(draft.primary),
      detailed: clean(draft.detailed),
      description: draft.description ?? '',
      color: draft.color ?? '#74c0fc',
      archivedAt: null,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    }
    categories.push(category)
    return category
  }
  function update(category: Category, draft: UpdateCustomCategoryDto) {
    const primary = clean(draft.primary ?? category.primary)
    const detailed = clean(draft.detailed ?? category.detailed)
    const existing = conflict(primary, detailed, category.id)
    if (existing) rejectConflict(existing)
    Object.assign(category, {
      primary,
      detailed,
      description:
        draft.description === undefined
          ? category.description
          : (draft.description ?? ''),
      color: draft.color ?? category.color,
      archivedAt:
        draft.archived === undefined
          ? category.archivedAt
          : draft.archived
            ? FIXTURE_NOW
            : null,
      updatedAt: FIXTURE_NOW,
    })
    for (const transaction of transactions)
      if (transaction.categoryId === category.id)
        transaction.category = category
    return category
  }
  function bulk(
    draft: BulkCustomCategoryActionDto,
  ): BulkCategoryActionResponse {
    const result: BulkCategoryActionResponse = {
      requested: draft.categoryIds.length,
      updated: 0,
      skipped: [],
    }
    for (const categoryId of new Set(draft.categoryIds)) {
      const category = categories.find((item) => item.id === categoryId)
      if (!category) {
        result.skipped.push({ categoryId, reason: 'not_found' })
        continue
      }
      if (category.archivedAt && draft.action !== 'restore') {
        result.skipped.push({ categoryId, reason: 'archived' })
        continue
      }
      if (draft.action === 'restore' && !category.archivedAt) {
        result.skipped.push({ categoryId, reason: 'duplicate_conflict' })
        continue
      }
      if (draft.action === 'duplicate') {
        let suffix = 1
        let detailed = `${category.detailed} (copy)`
        while (conflict(category.primary, detailed))
          detailed = `${category.detailed} (copy ${++suffix})`
        create({ ...category, detailed })
      } else if ('primary' in draft) {
        if (conflict(draft.primary, category.detailed, category.id)) {
          result.skipped.push({ categoryId, reason: 'duplicate_conflict' })
          continue
        }
        update(category, { primary: draft.primary })
      } else update(category, { archived: draft.action === 'archive' })
      result.updated++
    }
    return result
  }
  return {
    create,
    update,
    bulk,
    find: (id: string) => categories.find((item) => item.id === id),
    list: (archived = false) =>
      categories.filter((item) => Boolean(item.archivedAt) === archived),
  }
}
