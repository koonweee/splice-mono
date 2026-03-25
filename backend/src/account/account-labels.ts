export type AccountGrouping = 'cash' | 'credit' | 'investment' | 'liability';

type AccountLabel = string;

const ACCOUNT_LABEL_MAP: Record<string, AccountLabel> = {
  investment: 'Investment',
  credit: 'Credit',
  depository: 'Depository',
  loan: 'Loan',
  brokerage: 'Brokerage',
  other: 'Other',
  crypto_wallet: 'Crypto Wallet',
  '401a': '401(a)',
  '401k': '401(k)',
  '403B': '403(b)',
  '457b': '457(b)',
  '529': '529 Plan',
  auto: 'Auto',
  business: 'Business',
  'cash isa': 'Cash ISA',
  'cash management': 'Cash Management',
  cd: 'CD',
  checking: 'Checking',
  commercial: 'Commercial',
  construction: 'Construction',
  consumer: 'Consumer',
  'credit card': 'Credit Card',
  'crypto exchange': 'Crypto Exchange',
  ebt: 'EBT',
  'education savings account': 'Education Savings Account',
  'fixed annuity': 'Fixed Annuity',
  gic: 'GIC',
  'health reimbursement arrangement': 'Health Reimbursement Arrangement',
  'home equity': 'Home Equity',
  hsa: 'HSA',
  isa: 'ISA',
  ira: 'IRA',
  keogh: 'Keogh',
  lif: 'LIF',
  'life insurance': 'Life Insurance',
  'line of credit': 'Line of Credit',
  lira: 'LIRA',
  lrif: 'LRIF',
  lrsp: 'LRSP',
  'money market': 'Money Market',
  mortgage: 'Mortgage',
  'mutual fund': 'Mutual Fund',
  'non-custodial wallet': 'Non-Custodial Wallet',
  'non-taxable brokerage account': 'Non-Taxable Brokerage Account',
  'other insurance': 'Other Insurance',
  'other annuity': 'Other Annuity',
  overdraft: 'Overdraft',
  paypal: 'PayPal',
  payroll: 'Payroll',
  pension: 'Pension',
  prepaid: 'Prepaid',
  prif: 'PRIF',
  'profit sharing plan': 'Profit Sharing Plan',
  rdsp: 'RDSP',
  resp: 'RESP',
  retirement: 'Retirement',
  rlif: 'RLIF',
  roth: 'Roth',
  'roth 401k': 'Roth 401(k)',
  rrif: 'RRIF',
  rrsp: 'RRSP',
  sarsep: 'SARSEP',
  savings: 'Savings',
  'sep ira': 'SEP IRA',
  'simple ira': 'SIMPLE IRA',
  sipp: 'SIPP',
  'stock plan': 'Stock Plan',
  student: 'Student',
  'thrift savings plan': 'Thrift Savings Plan',
  tfsa: 'TFSA',
  trust: 'Trust',
  ugma: 'UGMA',
  utma: 'UTMA',
  'variable annuity': 'Variable Annuity',
};

export function formatAccountLabel(value: string | null | undefined): string {
  if (!value) return '';

  if (value in ACCOUNT_LABEL_MAP) {
    return ACCOUNT_LABEL_MAP[value];
  }

  const normalized = value.toLowerCase();
  if (normalized in ACCOUNT_LABEL_MAP) {
    return ACCOUNT_LABEL_MAP[normalized];
  }

  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

export function getAccountGrouping(type: string): AccountGrouping {
  switch (type.toLowerCase()) {
    case 'credit':
      return 'credit';
    case 'loan':
      return 'liability';
    case 'investment':
    case 'brokerage':
    case 'crypto_wallet':
      return 'investment';
    default:
      return 'cash';
  }
}

export function getAccountGroupingLabel(grouping: AccountGrouping): string {
  switch (grouping) {
    case 'cash':
      return 'Cash';
    case 'credit':
      return 'Credit';
    case 'investment':
      return 'Investment';
    case 'liability':
      return 'Liability';
  }
}
