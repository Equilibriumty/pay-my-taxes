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
import { err, errAsync, ok, okAsync, Result, ResultAsync } from "neverthrow";

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

  public getAccountsWithForeignCurrencies(): ResultAsync<
    Account[],
    MonobankClientErrors | RedisClientErrors
  > {
    const cacheKey = `accountsWithForeignCurrencies`;
    return this.redis.get<Account[]>(cacheKey).andThen((cached) => {
      if (cached !== null) {
        return okAsync(cached);
      }

      return ResultAsync.fromSafePromise(
        fetch(`${this.accountsUrl}`, {
          method: "GET",
          headers: { "X-Token": this.BANK_API_TOKEN },
        })
      ).andThen((response) => {
        if (!response.ok) {
          return errAsync(
            MonobankClientErrors.MONOBANK_FAILED_TO_FETCH_ACCOUNTS
          );
        }

        return ResultAsync.fromSafePromise(
          response.json() as Promise<PersonalInfo>
        ).andThen((data) => {
          console.log(`Fetched personal info... clientId ${data.clientId}`);

          if (!data.accounts) {
            return errAsync(MonobankClientErrors.MONOBANK_ACCOUNTS_NOT_FOUND);
          }

          const result = data.accounts.filter(
            (account) => account.currencyCode !== CURRENCY_SYMBOLS_TO_CODES.UAH
          );

          return this.redis
            .set(cacheKey, result)
            .andThen(() => okAsync(result));
        });
      });
    });
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
  private fetchTransactions(
    accountId: string,
    from: number,
    to: number
  ): ResultAsync<Transaction[], MonobankClientErrors | RedisClientErrors> {
    const cacheKey = `transactions:${accountId}:${from}:${to}`;
    return this.redis.get<Transaction[]>(cacheKey).andThen((cached) => {
      if (cached !== null) {
        return okAsync(cached);
      }

      const url = this.buildTransactionsUrl(accountId, from, to);

      return ResultAsync.fromSafePromise(
        fetch(url, {
          headers: { "X-Token": this.BANK_API_TOKEN },
        })
      ).andThen((res) => {
        if (!res.ok) {
          return errAsync(
            MonobankClientErrors.MONOBANK_FAILED_TO_FETCH_TRANSACTIONS
          );
        }

        return ResultAsync.fromSafePromise(
          res.json() as Promise<unknown>
        ).andThen((data) => {
          if (!Array.isArray(data)) {
            console.error("Unexpected response from Monobank:", data);
            return this.redis
              .set(cacheKey, [])
              .andThen(() =>
                errAsync(MonobankClientErrors.MONOBANK_TRANSACTIONS_NOT_FOUND)
              );
          }

          console.log(
            `Fetched ${data.length} transactions for ${new Date(
              from * 1000
            ).toLocaleDateString()} - ${new Date(
              to * 1000
            ).toLocaleDateString()}`
          );

          console.log(
            "⏳ Waiting couple of seconds to respect Monobank API rate limit..."
          );

          return ResultAsync.fromSafePromise(sleep(60_000)).andThen(() =>
            this.redis
              .set(cacheKey, data)
              .andThen(() => okAsync(data as Transaction[]))
          );
        });
      });
    });
  }

  public getIncomeByPeriod(
    period: Period
  ): ResultAsync<number[], MonobankClientErrors | RedisClientErrors> {
    return this.getIncomeByPeriodAsync(period);
  }

  private getIncomeByPeriodAsync(
    period: Period
  ): ResultAsync<number[], MonobankClientErrors | RedisClientErrors> {
    const processIncome = async (): Promise<number[]> => {
      const accounts = await this.getAccountsWithForeignCurrencies();

      if (accounts.isErr()) {
        console.error("Error fetching accounts", accounts.error);
        return [];
      }

      const fopAccounts = this.getFopAccounts(accounts.value);

      if (fopAccounts.isErr()) {
        console.error("Error fetching FOP accounts", fopAccounts.error);
        return [];
      }

      const accountsToUse = fopAccounts.value.filter(
        (account) => account.currencyCode !== CURRENCY_SYMBOLS_TO_CODES.UAH
      );

      if (accountsToUse.length === 0) {
        console.error("No accounts to use");
        return [];
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
          return [];
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
              return [];
            }

            const transactionsInUAH = txns.value
              .filter((txns) => txns.operationAmount > 0)
              .map((txns) => txns.operationAmount * currencyRate.value.rateBuy);

            allIncomes = [...allIncomes, ...transactionsInUAH];

            if (txns.value.length === MAX_TRANSACTIONS_PER_REQUEST) {
              // going back to the last transaction — the current one
              const lastTxn = txns.value[txns.value.length - 1];

              if (!lastTxn) {
                return [];
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
      return allIncomes;
    };

    return ResultAsync.fromSafePromise(processIncome());
  }

  public fetchCurrencyRateByCurrencyPair(
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ): ResultAsync<Currency, MonobankClientErrors | RedisClientErrors> {
    const cacheKey = `currencyRate:${fromCurrency}:${toCurrency}`;
    return this.redis.get<Currency>(cacheKey).andThen((cached) => {
      if (cached !== null) {
        return okAsync(cached);
      }

      return ResultAsync.fromSafePromise(
        fetch(this.currencyUrl, {
          method: "POST",
        })
      ).andThen((response) => {
        if (!response.ok) {
          return errAsync(
            MonobankClientErrors.MONOBANK_FAILED_TO_FETCH_CURRENCY_RATE
          );
        }

        return ResultAsync.fromSafePromise(
          response.json() as Promise<Array<Currency>>
        ).andThen((data) => {
          console.log("Fetched currency rates...");

          const currencyRate = data.find(
            (rate) =>
              rate.currencyCodeA === fromCurrency &&
              rate.currencyCodeB === toCurrency
          );

          if (!currencyRate) {
            return errAsync(
              MonobankClientErrors.MONOBANK_CURRENCY_RATE_NOT_FOUND
            );
          }

          console.log(
            `Found currency rate for pair ${CURRENCY_CODES_TO_SYMBOLS[fromCurrency]} to ${CURRENCY_CODES_TO_SYMBOLS[toCurrency]}: ${currencyRate.rateBuy}`
          );

          return this.redis
            .set(cacheKey, currencyRate)
            .andThen(() => okAsync(currencyRate));
        });
      });
    });
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
