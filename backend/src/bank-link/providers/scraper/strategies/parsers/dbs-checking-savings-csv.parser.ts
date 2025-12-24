export interface DBSTransaction {
  date: string;
  reference: string;
  transactionRef1: string;
  transactionRef2: string;
  transactionRef3: string;
  amount: number;
}

export interface DBSAccountInfo {
  accountName: string;
  statementDate: string;
  availableBalance: number;
  ledgerBalance: number;
  transactions: DBSTransaction[];
}

function parseDBSBalance(balanceStr: string): number {
  return parseFloat(balanceStr.replace(/[^0-9.-]+/g, ''));
}

export function parseCSVLine(line: string): string[] {
  return line.split(',').map((item) => item.trim());
}

export function parseTransactionLine(line: string): string[] {
  const result: string[] = [];

  const [dateStr, refStr, debitStr, creditStr, ...rest] = line.split(',');
  result.push(dateStr.trim(), refStr.trim(), debitStr.trim(), creditStr.trim());

  const regex = /,(|(([^,]|(, ))+)),/;

  let remainingLine = `,${rest.join(',')}`;
  const matches: string[] = [];

  for (let i = 0; i < 3; i++) {
    const match = remainingLine.match(regex);
    if (!match) {
      break;
    }
    const currentMatch = match[0];
    const currentMatchWithoutWrappingCommas = currentMatch.substring(
      1,
      currentMatch.length - 1,
    );
    matches.push(currentMatchWithoutWrappingCommas);
    remainingLine = `,${remainingLine.substring(currentMatch.length)}`;
  }

  return [...result, ...matches];
}

function parseDBSTransaction(row: string[]): DBSTransaction {
  const debitStr = row[2].trim();
  const creditStr = row[3].trim();
  const amount = debitStr
    ? parseFloat(debitStr)
    : creditStr
      ? -parseFloat(creditStr)
      : 0;

  return {
    date: row[0],
    reference: row[1],
    transactionRef1: row[4] || '',
    transactionRef2: row[5] || '',
    transactionRef3: row[6] || '',
    amount,
  };
}

export function parseDBSCSV(csvContent: string): DBSAccountInfo {
  const lines = csvContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line);

  const accountNameRow = parseCSVLine(lines[0]);
  const statementDateRow = parseCSVLine(lines[1]);
  const availableBalanceRow = parseCSVLine(lines[2]);
  const ledgerBalanceRow = parseCSVLine(lines[3]);

  const accountName = accountNameRow[1];
  const statementDate = statementDateRow[1];
  const availableBalance = parseDBSBalance(availableBalanceRow[1]);
  const ledgerBalance = parseDBSBalance(ledgerBalanceRow[1]);

  const transactionHeaderIndex = lines.findIndex((line) =>
    line.includes('Transaction Date,Reference,Debit Amount,Credit Amount'),
  );

  if (transactionHeaderIndex === -1) {
    throw new Error('Could not find transaction header in CSV');
  }

  const transactions = lines
    .slice(transactionHeaderIndex + 1)
    .filter((line) => line && !line.startsWith(','))
    .map((line) => parseDBSTransaction(parseTransactionLine(line)));

  return {
    accountName,
    statementDate,
    availableBalance,
    ledgerBalance,
    transactions,
  };
}
