// Shared frontend-only display constants.
export const CATEGORY_COLORS: Record<string, string> = {
  INCOME: '#12b886',
  LOAN_PAYMENTS: '#e64980',
  BANK_FEES: '#be4bdb',
  ENTERTAINMENT: '#7950f2',
  FOOD_AND_DRINK: '#4c6ef5',
  GENERAL_MERCHANDISE: '#228be6',
  HOME_IMPROVEMENT: '#15aabf',
  MEDICAL: '#20c997',
  PERSONAL_CARE: '#40c057',
  GENERAL_SERVICES: '#82c91e',
  GOVERNMENT_AND_NON_PROFIT: '#fab005',
  TRANSPORTATION: '#fd7e14',
  TRAVEL: '#f06595',
  RENT_AND_UTILITIES: '#ff6b6b',
  UNCATEGORIZED: '#868e96',
}

export const FALLBACK_COLORS = [
  '#845ef7',
  '#339af0',
  '#51cf66',
  '#fcc419',
  '#ff8787',
  '#da77f2',
]

export function getCategoryColor(category: string, index: number): string {
  return (
    CATEGORY_COLORS[category] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  )
}
