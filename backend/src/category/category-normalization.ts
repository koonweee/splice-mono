export function cleanCategoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeCategoryKey(value: string): string {
  return cleanCategoryLabel(value.replace(/_/g, ' ')).toLowerCase();
}

export function formatCategoryPair(primary: string, detailed: string): string {
  return `${primary} > ${detailed}`;
}

export function formatProviderCategoryLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatProviderCategoryDisplayLabel(
  primary: string | null,
  detailed: string | null,
): string | null {
  if (!primary && !detailed) {
    return null;
  }
  if (!primary) {
    return detailed ? formatProviderCategoryLabel(detailed) : null;
  }
  if (!detailed) {
    return formatProviderCategoryLabel(primary);
  }
  const prefix = `${primary}_`;
  const displayDetailed = detailed.startsWith(prefix)
    ? detailed.slice(prefix.length)
    : detailed;

  return formatCategoryPair(
    formatProviderCategoryLabel(primary),
    formatProviderCategoryLabel(displayDetailed),
  );
}
