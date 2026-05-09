import type { Category } from '../api/models'

export function isAssignableCategoryOption(category: Category) {
  return !category.archivedAt
}
