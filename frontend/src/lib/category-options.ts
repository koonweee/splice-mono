import type { Category } from '../api/models'

type CategoryVisibilityFields = {
  isHidden?: boolean
  isSelectable?: boolean
}

export function isAssignableCategoryOption(category: Category) {
  const visibility = category as Category & CategoryVisibilityFields

  return (
    !category.archivedAt &&
    visibility.isHidden !== true &&
    visibility.isSelectable !== false
  )
}
