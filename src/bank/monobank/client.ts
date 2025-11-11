import type { Period } from "../../shared/types";
import { BankClient } from "../client";
import {
  CURRENCY_CODES_TO_SYMBOLS,
  CURRENCY_SYMBOLS_TO_CODES,
  MAX_TRANSACTIONS_PER_REQUEST,
} from "./const";
import { sleep } from "../../utils/sleep";
import type {
  Account,
  Currency,
  CurrencyCode,
  PersonalInfo,
  Transaction,
} from "./types";
import { MONOBANK_API_TOKEN, MONOBANK_API_URL } from "./config";
import {
  redisClient,
  RedisClient,
  RedisClientErrors,
} from "../../redis/client";
import { err, ok, Result, type ResultAsync } from "neverthrow";

export enum MonobankClientErrors {
  MONOBANK_INCOME_NOT_FOUND = "MONOBANK_INCOME_NOT_FOUND",
  MONOBANK_ACCOUNTS_NOT_FOUND = "MONOBANK_ACCOUNTS_NOT_FOUND",
  MONOBANK_TRANSACTIONS_NOT_FOUND = "MONOBANK_TRANSACTIONS_NOT_FOUND",
  MONOBANK_FOP_ACCOUNTS_NOT_FOUND = "MONOBANK_FOP_ACCOUNTS_NOT_FOUND",
  MONOBANK_FAILED_TO_FETCH_TRANSACTIONS = "MONOBANK_FAILED_TO_FETCH_TRANSACTIONS",
  MONOBANK_FAILED_TO_FETCH_CURRENCY_RATE = "MONOBANK_FAILED_TO_FETCH_CURRENCY_RATE",
  MONOBANK_FAILED_TO_FETCH_ACCOUNTS = "MONOBANK_FAILED_TO_FETCH_ACCOUNTS",
  MONOBANK_LAST_TRANSACTION_NOT_FOUND = "MONOBANK_LAST_TRANSACTION_NOT_FOUND",
  MONOBANK_CURRENCY_RATE_NOT_FOUND = "MONOBANK_CURRENCY_RATE_NOT_FOUND",
}

export class MonobankClient extends BankClient {
  constructor(
    bankId: string,
    MONOBANK_API_TOKEN: string,
    MONOBANK_API_URL: string,
    redis: RedisClient
  ) {
    super(bankId, MONOBANK_API_TOKEN, MONOBANK_API_URL, redis);
  }

  get accountsUrl() {
    return `${this.BANK_API_URL}/personal/client-info`;
  }

  get currencyUrl() {
    return `${this.BANK_API_URL}/bank/currency`;
  }

  private buildTransactionsUrl(accountId: string, from: number, to: number) {
    return `${this.BANK_API_URL}/personal/statement/${accountId}/${from}/${to}`;
  }

  public async getAccountsWithForeignCurrencies(): Promise<
    Result<Account[], MonobankClientErrors>
  > {
    const cacheKey = `accountsWithForeignCurrencies`;
    const cached = await this.redis.get<Account[]>(cacheKey);
    if (cached.isOk() && cached.value !== null) {
      return ok(cached.value);
    }
    const response = await fetch(`${this.accountsUrl}`, {
      method: "GET",
      headers: { "X-Token": this.BANK_API_TOKEN },
    });
    const data = (await response.json()) as PersonalInfo;

    if (!response.ok) {
      return err(MonobankClientErrors.MONOBANK_FAILED_TO_FETCH_ACCOUNTS);
    }

    console.log(`Fetched personal info... clientId ${data.clientId}`);

    if (!data.accounts) {
      return err(MonobankClientErrors.MONOBANK_ACCOUNTS_NOT_FOUND);
    }

    const result = data.accounts.filter(
      (account) => account.currencyCode !== CURRENCY_SYMBOLS_TO_CODES.UAH
    );
    await this.redis.set(cacheKey, result);
    return ok(result);
  }

  private getFopAccounts(
    accounts: Account[]
  ): Result<Account[], MonobankClientErrors> {
    const fopAccounts = accounts.filter((account) => account.type === "fop");

    if (fopAccounts.length === 0) {
      return err(MonobankClientErrors.MONOBANK_FOP_ACCOUNTS_NOT_FOUND);
    }

    console.log(`Found ${fopAccounts.length} FOP accounts!`);

    return ok(fopAccounts);
  }
  private async fetchTransactions(
    accountId: string,
    from: number,
    to: number
  ): Promise<Result<Transaction[], MonobankClientErrors | RedisClientErrors>> {
    const cacheKey = `transactions:${accountId}:${from}:${to}`;
    const cached = await this.redis.get<Transaction[]>(cacheKey);
    if (cached.isOk() && cached.value !== null) {
      return ok(cached.value);
    }
    const url = this.buildTransactionsUrl(accountId, from, to);

    const res = await fetch(url, {
      headers: { "X-Token": this.BANK_API_TOKEN },
    });

    const data = await res.json();

    if (!res.ok) {
      return err(MonobankClientErrors.MONOBANK_FAILED_TO_FETCH_TRANSACTIONS);
    }

    if (!Array.isArray(data)) {
      console.error("Unexpected response from Monobank:", data);
      const result = await this.redis.set(cacheKey, []);
      if (result.isErr()) {
        return err(result.error);
      }
      return err(MonobankClientErrors.MONOBANK_TRANSACTIONS_NOT_FOUND);
    }

    console.log(
      `Fetched ${data.length} transactions for ${new Date(
        from * 1000
      ).toLocaleDateString()} - ${new Date(to * 1000).toLocaleDateString()}`
    );

    console.log(
      "⏳ Waiting couple of seconds to respect Monobank API rate limit..."
    );
    await sleep(60_000);

    const result = await this.redis.set(cacheKey, data);
    if (result.isErr()) {
      return err(result.error);
    }

    return ok(data) as Result<
      Transaction[],
      MonobankClientErrors | RedisClientErrors
    >;
  }

  public async getIncomeByPeriod(
    period: Period
  ): Promise<Result<number[], MonobankClientErrors | RedisClientErrors>> {
    const accounts = await this.getAccountsWithForeignCurrencies();

    if (accounts.isErr()) {
      console.error("Error fetching accounts", accounts.error);
      return err(accounts.error);
    }

    const fopAccounts = this.getFopAccounts(accounts.value);

    if (fopAccounts.isErr()) {
      console.error("Error fetching FOP accounts", fopAccounts.error);
      return err(fopAccounts.error);
    }

    const accountsToUse = fopAccounts.value.filter(
      (account) => account.currencyCode !== CURRENCY_SYMBOLS_TO_CODES.UAH
    );

    if (accountsToUse.length === 0) {
      console.error("No accounts to use");
      return err(MonobankClientErrors.MONOBANK_ACCOUNTS_NOT_FOUND);
    }

    let allIncomes: number[] = [];
    // Use the start of the current day (midnight UTC) for 'now' to improve cache effectiveness
    const now = Math.floor(Date.now() / 1000);
    const dayStart = now - (now % (24 * 60 * 60)); // midnight UTC today
    const fromTime = dayStart - period * 30 * 24 * 60 * 60; // ~N months, aligned to day start
    const maxRange = 2682000; // 31 day + 1 hour

    for (const account of accountsToUse) {
      console.log(
        `Fetching transactions for account: ${account.id} with ${
          CURRENCY_CODES_TO_SYMBOLS[account.currencyCode]
        }`
      );

      const accountId = account.id;
      let currentFrom = fromTime;

      const currencyRate = await this.fetchCurrencyRateByCurrencyPair(
        account.currencyCode,
        CURRENCY_SYMBOLS_TO_CODES.UAH
      );

      if (currencyRate.isErr()) {
        console.error("Error fetching currency rate", currencyRate.error);
        return err(currencyRate.error);
      }

      while (currentFrom < now) {
        let currentTo = Math.min(currentFrom + maxRange, now);

        while (true) {
          const txns = await this.fetchTransactions(
            accountId,
            currentFrom,
            currentTo
          );

          if (txns.isErr()) {
            console.error("Error fetching transactions", txns.error);
            return err(txns.error);
          }

          const transactionsInUAH = txns.value
            .filter((txns) => txns.operationAmount > 0)
            .map((txns) => txns.operationAmount * currencyRate.value.rateBuy);

          allIncomes = [...allIncomes, ...transactionsInUAH];

          if (txns.value.length === MAX_TRANSACTIONS_PER_REQUEST) {
            // going back to the last transaction — the current one
            const lastTxn = txns.value[txns.value.length - 1];

            if (!lastTxn) {
              return err(
                MonobankClientErrors.MONOBANK_LAST_TRANSACTION_NOT_FOUND
              );
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
    return ok(allIncomes);
  }

  public async fetchCurrencyRateByCurrencyPair(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ): Promise<Result<Currency, MonobankClientErrors | RedisClientErrors>> {
    const cacheKey = `currencyRate:${fromCurrency}:${toCurrency}`;
    const cached = await this.redis.get<Currency>(cacheKey);

    if (cached.isOk() && cached.value !== null) {
      return ok(cached.value);
    }

    const response = await fetch(this.currencyUrl, {
      method: "POST",
    });

    if (!response.ok) {
      return err(MonobankClientErrors.MONOBANK_FAILED_TO_FETCH_CURRENCY_RATE);
    }

    const data = (await response.json()) as Array<Currency>;

    console.log("Fetched currency rates...");

    const currencyRate = data.find(
      (rate) =>
        rate.currencyCodeA === fromCurrency && rate.currencyCodeB === toCurrency
    );

    if (!currencyRate) {
      return err(MonobankClientErrors.MONOBANK_CURRENCY_RATE_NOT_FOUND);
    }

    console.log(
      `Found currency rate for pair ${CURRENCY_CODES_TO_SYMBOLS[fromCurrency]} to ${CURRENCY_CODES_TO_SYMBOLS[toCurrency]}: ${currencyRate.rateBuy}`
    );

    const result = await this.redis.set(cacheKey, currencyRate);
    if (result.isErr()) {
      return err(result.error);
    }
    return ok(currencyRate);
  }
}

if (!MONOBANK_API_TOKEN) {
  throw new Error("MONOBANK_API_TOKEN is not defined");
}

export const monobankClient = new MonobankClient(
  "monobank",
  MONOBANK_API_TOKEN,
  MONOBANK_API_URL,
  redisClient
);
