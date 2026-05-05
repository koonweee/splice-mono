export function cleanCategoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeCategoryKey(value: string): string {
  return cleanCategoryLabel(value.replace(/_/g, ' ')).toLowerCase();
}

export function formatCategoryPair(primary: string, detailed: string): string {
  return `${primary} > ${detailed}`;
}

function formatPlaidLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatCategoryDisplayPair(
  source: 'plaid' | 'user',
  primary: string,
  detailed: string,
): string {
  if (source === 'user') {
    return formatCategoryPair(primary, detailed);
  }

  const prefix = `${primary}_`;
  const displayDetailed = detailed.startsWith(prefix)
    ? detailed.slice(prefix.length)
    : detailed;

  return formatCategoryPair(
    formatPlaidLabel(primary),
    formatPlaidLabel(displayDetailed),
  );
}

export function normalizePlaidDetailedKey(
  primary: string,
  detailed: string,
): string {
  const prefix = `${primary}_`;
  const displayDetailed = detailed.startsWith(prefix)
    ? detailed.slice(prefix.length)
    : detailed;

  return normalizeCategoryKey(displayDetailed);
}
