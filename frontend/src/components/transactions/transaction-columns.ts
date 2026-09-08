export const transactionColumns = {
  providerDate: { header: 'Date', size: 150 },
  description: { header: 'Description', size: 260 },
  amount: { header: 'Amount', size: 110 },
  accountName: { header: 'Account', size: 180 },
  category: { header: 'Category', size: 220 },
} as const

export const transactionTablePaperProps = {
  withBorder: true,
  shadow: 'xs',
  bg: 'transparent',
  radius: 'sm',
} as const
