import { MONOBANK_API_TOKEN, MONOBANK_API_URL } from "./config";
import {
  CURRENCY_CODES_TO_SYMBOLS,
  CURRENCY_SYMBOLS_TO_CODES,
  MAX_TRANSACTIONS_PER_REQUEST,
} from "./const";
import type {
  Account,
  Currency,
  CurrencyCode,
  PersonalInfo,
  Transaction,
} from "./types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MonobankClient {
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

  public async getAccountsWithForeignCurrencies() {
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

      console.log(`Fetched personal info... clientId ${data.clientId}`);

      return data.accounts.filter(
        (account) => account.currencyCode !== CURRENCY_SYMBOLS_TO_CODES.UAH
      );
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
  private async fetchTransactions(
    accountId: string,
    from: number,
    to: number
  ): Promise<Transaction[] | undefined> {
    const url = this.buildTransactionsUrl(accountId, from, to);

    try {
      const res = await fetch(url, {
        headers: { "X-Token": this.MONOBANK_API_TOKEN },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          `Monobank API error: ${res.status} ${
            res.statusText
          } — ${JSON.stringify(data)}`
        );
      }

      if (!Array.isArray(data)) {
        console.error("Unexpected response from Monobank:", data);
        return [];
      }

      console.log(
        `Fetched ${data.length} transactions for ${new Date(
          from * 1000
        ).toLocaleDateString()} - ${new Date(to * 1000).toLocaleDateString()}`
      );

      console.log(
        "⏳ Waiting couple of seconds to respect Monobank API rate limit..."
      );
      await sleep(3000);

      return data as Transaction[];
    } catch (error) {
      console.error("error", error);
      return [];
    }
  }

  public async getIncomeByPeriod(accounts: Account[], monthsBack: number) {
    const fopAccounts = this.getFopAccounts(accounts);

    const accountsToUse = fopAccounts.filter(
      (account) => account.currencyCode !== CURRENCY_SYMBOLS_TO_CODES.UAH
    );

    let allTransactions: Transaction[] = [];

    const now = Math.floor(Date.now() / 1000); // seconds
    const fromTime = now - monthsBack * 30 * 24 * 60 * 60; // ~N months
    const maxRange = 2682000; // 31 day + 1 hour

    for (const account of accountsToUse) {
      console.log(
        `Fetching transactions for account: ${account.id} with ${
          CURRENCY_CODES_TO_SYMBOLS[account.currencyCode]
        }`
      );

      const accountId = account.id;
      let currentFrom = fromTime;

      while (currentFrom < now) {
        let currentTo = Math.min(currentFrom + maxRange, now);

        while (true) {
          const txns = await this.fetchTransactions(
            accountId,
            currentFrom,
            currentTo
          );

          if (!txns) {
            console.log("No transactions found");
            return;
          }

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
    }
    return allTransactions
      .map((txn) => txn.operationAmount)
      .filter((txn) => txn > 0);
  }

  public async fetchCurrencyRateByCurrencyPair(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ) {
    const response = await fetch(this.currencyUrl, {
      method: "POST",
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
}
