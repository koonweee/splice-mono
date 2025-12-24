import { Injectable, type Logger } from '@nestjs/common';
import { AccountSubtype, AccountType } from 'plaid';
import type { Page } from 'playwright';
import type { APIAccount, Institution } from '../../../../types/BankLink';
import { MoneySign, MoneyWithSign } from '../../../../types/MoneyWithSign';
import { BaseScraperStrategy } from './base-scraper.strategy';
import { parseDBSCSV } from './parsers/dbs-checking-savings-csv.parser';

interface AccountSelectorOption {
  text: string;
  value: string;
}

type DBSAccountType = 'savings_or_checking' | 'credit_card';

interface AccountInformation {
  transactions: object[];
  totalBalance: number;
  type: DBSAccountType;
}

interface DBSCredentials {
  username: string;
  password: string;
}

@Injectable()
export class DBSStrategy extends BaseScraperStrategy<DBSCredentials> {
  name = 'dbs';
  startUrl = 'https://internet-banking.dbs.com.sg/IB/Welcome';
  institution = {
    id: 'dbs',
    name: 'DBS Bank',
  };

  async scrape(
    credentials: DBSCredentials,
    page: Page,
    logger: Logger,
  ): Promise<{ accounts: APIAccount[]; institution?: Institution }> {
    const { username, password } = credentials;
    logger.log({ bankId: this.name }, 'Starting DBS scraping process');

    await page.locator('#UID').fill(username);
    await page.locator('#PIN').fill(password);
    logger.log({ bankId: this.name }, 'Filled username and pin');
    await this.screenshotStep(page, 'after-filling-credentials', logger);

    await page.getByRole('button', { name: 'Login' }).click();
    logger.log({ bankId: this.name }, 'Clicked login button');
    await this.screenshotStep(page, 'after-login-click', logger);

    await page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .locator('iframe[name="iframe1"]')
      .contentFrame()
      .getByRole('link', { name: 'Authenticate now' })
      .click();
    await this.screenshotStep(page, 'after-authenticate-click', logger);

    logger.log({ bankId: this.name }, 'Awaiting authentication in app');

    await page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .locator('iframe[name="iframe1"]')
      .contentFrame()
      .getByRole('heading', { name: 'Welcome Back' })
      .click({ timeout: 300000 });

    logger.log({ bankId: this.name }, 'Authenticated in app');
    await this.screenshotStep(page, 'after-authentication', logger);

    await page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .getByRole('heading', { name: 'My Accounts' })
      .click();
    await this.screenshotStep(page, 'after-my-accounts-click', logger);

    await page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .getByRole('link', { name: 'View Transaction History' })
      .click();
    await this.screenshotStep(page, 'after-transaction-history-click', logger);

    logger.log({ bankId: this.name }, 'Navigated to transaction history');

    const accountSelector = page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .locator('iframe[name="iframe1"]')
      .contentFrame()
      .locator('#account_number_select');

    logger.log({ bankId: this.name }, 'Waiting for account selector');
    await accountSelector.waitFor({ state: 'visible' });
    await this.screenshotStep(page, 'account-selector-visible', logger);

    const accountOptions = await accountSelector.locator('option').all();

    const accountSelectorOptions = (
      await Promise.all(
        accountOptions.map(async (option) => {
          const text = await option.textContent();
          const optionValue = await option.getAttribute('value');
          if (!text || !optionValue) {
            logger.warn(
              { bankId: this.name },
              'Skipping account option with missing text or value',
            );
            return null;
          }
          return { text: text.trim(), value: optionValue };
        }),
      )
    ).filter((account): account is AccountSelectorOption => account !== null);

    const filteredAccounts = accountSelectorOptions.filter(
      (account) => account && !account.text.includes('Please select'),
    );
    logger.log(
      { bankId: this.name, accountCount: filteredAccounts.length },
      'Found accounts for scraping',
    );

    const accounts: APIAccount[] = [];

    for (const account of filteredAccounts) {
      logger.log(
        { bankId: this.name, accountName: account.text },
        'Scraping account',
      );
      const info = await this.getAccountInformation(page, account, logger);
      const apiAccount = this.buildApiAccount(account.text, info, logger);
      if (apiAccount) {
        accounts.push(apiAccount);
      }
    }

    return { accounts, institution: this.institution };
  }

  private async getAccountInformation(
    page: Page,
    accountSelectorOption: AccountSelectorOption,
    logger: Logger,
  ): Promise<AccountInformation> {
    const accountSelector = page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .locator('iframe[name="iframe1"]')
      .contentFrame()
      .locator('#account_number_select');
    await accountSelector.selectOption(accountSelectorOption.value);
    await this.screenshotStep(
      page,
      `after-selecting-account-${accountSelectorOption.value}`,
      logger,
    );

    const transactionPeriodInput = page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .locator('iframe[name="iframe1"]')
      .contentFrame()
      .locator('#selectRange');

    let accountType: DBSAccountType;
    try {
      await transactionPeriodInput.waitFor({ state: 'visible', timeout: 2000 });
      accountType = 'savings_or_checking';
    } catch {
      logger.log(
        { bankId: this.name, accountName: accountSelectorOption.text },
        'Transaction period selector not found, assuming credit card',
      );
      accountType = 'credit_card';
    }

    if (accountType === 'savings_or_checking') {
      await transactionPeriodInput.click();
      const last3MonthsOption = page
        .locator('frame[name="user_area"]')
        .contentFrame()
        .locator('iframe[name="iframe1"]')
        .contentFrame()
        .getByRole('listitem')
        .filter({ hasText: 'Last 3 Months' });
      await last3MonthsOption.waitFor({ state: 'visible' });
      await last3MonthsOption.click();
      await this.screenshotStep(
        page,
        'after-filling-transaction-period',
        logger,
      );
    } else {
      return {
        transactions: [],
        totalBalance: 0,
        type: accountType,
      };
    }

    await page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .locator('iframe[name="iframe1"]')
      .contentFrame()
      .getByRole('button', { name: 'Go' })
      .click();
    await this.screenshotStep(page, 'after-go-click', logger);

    const transactionTable = page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .locator('iframe[name="iframe1"]')
      .contentFrame()
      .locator('#transactionTable');
    await transactionTable.waitFor({ state: 'visible' });

    const downloadButton = page
      .locator('frame[name="user_area"]')
      .contentFrame()
      .locator('iframe[name="iframe1"]')
      .contentFrame()
      .locator('a[onclick="fn_downloadCSV()"]');

    await downloadButton.waitFor({ state: 'visible' });
    await this.screenshotStep(page, 'download-button-visible', logger);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);
    await this.screenshotStep(page, 'after-download-click', logger);

    const downloadedFilePath = await download.path();
    if (!downloadedFilePath) {
      throw new Error('Failed to download DBS transactions CSV');
    }

    const csvContent = await download
      .createReadStream()
      .then(async (stream) => {
        if (!stream) {
          throw new Error('Failed to read DBS transactions CSV stream');
        }
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk as Uint8Array));
        }
        return Buffer.concat(chunks).toString('utf8');
      });

    const parsedCSV = parseDBSCSV(csvContent);

    return {
      transactions: parsedCSV.transactions,
      totalBalance: parsedCSV.availableBalance,
      type: accountType,
    };
  }

  private buildApiAccount(
    accountName: string,
    info: AccountInformation,
    logger: Logger,
  ): APIAccount | null {
    if (!Number.isFinite(info.totalBalance)) {
      logger.warn(
        { bankId: this.name, accountName, balance: info.totalBalance },
        'Skipping account with invalid balance',
      );
      return null;
    }

    const sign =
      info.totalBalance >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE;
    const balance = MoneyWithSign.fromFloat('SGD', info.totalBalance, sign);

    const accountType =
      info.type === 'credit_card' ? AccountType.Credit : AccountType.Depository;

    return {
      accountId: `scraper:${this.name}:${accountName}`,
      name: accountName,
      mask: null,
      type: accountType,
      subType: info.type === 'credit_card' ? AccountSubtype.CreditCard : null,
      availableBalance: balance.toSerialized(),
      currentBalance: balance.toSerialized(),
    };
  }
}
