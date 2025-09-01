import { MONOBANK_API_TOKEN, MONOBANK_API_URL } from "./config";
import {
  CURRENCY_CODES_TO_SYMBOLS,
  MAX_TRANSACTIONS_PER_REQUEST,
} from "./const";
import type {
  Account,
  Currency,
  CurrencyCode,
  PersonalInfo,
  Transaction,
} from "./types";

class MonobankClient {
  private readonly MONOBANK_API_TOKEN: string;
  private readonly MONOBANK_API_URL: string = MONOBANK_API_URL;

  constructor(MONOBANK_API_TOKEN: string) {
    this.MONOBANK_API_TOKEN = MONOBANK_API_TOKEN;
  }

  get accountsUrl() {
    return `${this.MONOBANK_API_URL}/personal/client-info`;
  }

  get currencyUrl() {
    return `${this.MONOBANK_API_URL}/bank/currency`;
  }

  private buildTransactionsUrl(accountId: string, from: number, to: number) {
    return `${this.MONOBANK_API_URL}/personal/statement/${accountId}/${from}/${to}`;
  }

  public async getAccounts() {
    try {
      const response = await fetch(`${this.accountsUrl}`, {
        method: "GET",
        headers: { "X-Token": this.MONOBANK_API_TOKEN },
      });
      const data = (await response.json()) as PersonalInfo;

      if (!response.ok) {
        throw new Error(
          `Monobank API error: ${response.status} ${response.statusText}`
        );
      }

      console.log(`Fetched persoanl info... clientId ${data.clientId}`);

      return data.accounts;
    } catch (error) {
      console.error("error", error);
    }
  }

  private getFopAccounts(accounts: Account[]) {
    const fopAccounts = accounts.filter((account) => account.type === "fop");

    if (fopAccounts.length === 0) {
      throw new Error("No FOP accounts found");
    }

    console.log(`Found ${fopAccounts.length} FOP accounts!`);

    return fopAccounts;
  }

  private getFopAccountByCurrencyCode(
    accounts: Account[],
    currencyCode: CurrencyCode
  ) {
    const fopAccounts = this.getFopAccounts(accounts);
    const fopAccount = fopAccounts.find(
      (account) => account.currencyCode === currencyCode
    );
    if (!fopAccount) {
      throw new Error(`No FOP account found for currency code ${currencyCode}`);
    }
    return fopAccount;
  }

  private async fetchTransactions(
    accountId: string,
    from: number,
    to: number
  ): Promise<Transaction[]> {
    const url = this.buildTransactionsUrl(accountId, from, to);
    const res = await fetch(url, {
      headers: { "X-Token": this.MONOBANK_API_TOKEN },
    });

    const data = (await res.json()) as Transaction[];

    console.log(
      `Fetching transactions for period ${new Date(
        from * 1000
      ).toLocaleDateString()} to ${new Date(to * 1000).toLocaleDateString()}`
    );

    if (!res.ok) {
      throw new Error(`Monobank API error: ${res.status} ${res.statusText}`);
    }

    return data;
  }

  private calculateIncome(transactions: Transaction[]) {
    const onlyIncomeTxns = transactions.filter(
      (txn) => txn.operationAmount > 0
    );

    const income = onlyIncomeTxns.reduce((acc, txn) => {
      return acc + txn.operationAmount;
    }, 0);

    const normalizedIncome = income / 100;

    console.log("Calculated income: ", normalizedIncome);

    return normalizedIncome;
  }

  public async getIncomeByPeriod(
    accounts: Account[],
    currencyCode: CurrencyCode,
    monthsBack: number
  ) {
    const fopAccount = this.getFopAccountByCurrencyCode(accounts, currencyCode);
    const accountId = fopAccount.id;

    const now = Math.floor(Date.now() / 1000); // seconds
    const fromTime = now - monthsBack * 30 * 24 * 60 * 60; // ~N months
    let allTransactions: Transaction[] = [];
    let currentFrom = fromTime;
    const maxRange = 2682000; // 31 day + 1 hour

    while (currentFrom < now) {
      let currentTo = Math.min(currentFrom + maxRange, now);

      while (true) {
        const txns = await this.fetchTransactions(
          accountId,
          currentFrom,
          currentTo
        );

        allTransactions = [...allTransactions, ...txns];

        if (txns.length === MAX_TRANSACTIONS_PER_REQUEST) {
          // going back to the last transaction — the current one
          const lastTxn = txns[txns.length - 1];

          if (!lastTxn) {
            throw new Error("No transactions found");
          }

          const lastTxnTime = lastTxn.time;
          currentTo = lastTxnTime - 1;
        } else {
          break; // less than 500 → all transactions in the range were fetched
        }
      }

      // next block
      currentFrom = currentTo;
    }

    return this.calculateIncome(allTransactions);
  }

  public async fetchCurrencyRates(
    amount: number,
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ) {
    const response = await fetch(this.currencyUrl, {
      method: "POST",
      body: JSON.stringify({ amount, fromCurrency, toCurrency }),
    });

    if (!response.ok) {
      throw new Error(
        `Monobank API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as Array<Currency>;

    console.log("Fetched currency rates...");

    const currencyRate = data.find(
      (rate) =>
        rate.currencyCodeA === fromCurrency && rate.currencyCodeB === toCurrency
    );

    if (!currencyRate) {
      throw new Error(
        `No currency rate found for ${fromCurrency} to ${toCurrency}`
      );
    }

    console.log(
      `Found currency rate for group ${CURRENCY_CODES_TO_SYMBOLS[fromCurrency]} to ${CURRENCY_CODES_TO_SYMBOLS[toCurrency]}: ${currencyRate.rateBuy}`
    );

    return currencyRate;
  }

  public async calculateIncomeInTargetCurrency(
    income: number,
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ) {
    const currencyRate = await this.fetchCurrencyRates(
      income,
      fromCurrency,
      toCurrency
    );

    const incomeInTargetCurrency = income * currencyRate.rateBuy;

    console.log(
      `Calculated income in target currency (${CURRENCY_CODES_TO_SYMBOLS[toCurrency]}): ${incomeInTargetCurrency} `
    );

    return incomeInTargetCurrency;
  }
}

if (!MONOBANK_API_TOKEN) {
  throw new Error("MONOBANK_API_TOKEN is not defined");
}

export const monobankClient = new MonobankClient(MONOBANK_API_TOKEN);
