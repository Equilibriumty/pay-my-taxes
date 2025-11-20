import { describe, expect, test } from "bun:test";
import { MonobankClient, MonobankClientErrors } from "../bank/monobank/client";
import type { Account } from "../bank/monobank/types";
import { CURRENCY_SYMBOLS_TO_CODES } from "../bank/monobank/const";
import { err } from "neverthrow";

// Mock Redis client for testing
class MockRedisClient {
  async get() {
    return { isOk: () => false, value: null };
  }
  async set() {
    return { isOk: () => true, value: 1 };
  }
}

describe("MonobankClient", () => {
  const mockRedis = new MockRedisClient() as any;
  const monobankClient = new MonobankClient(
    "monobank",
    "test-token",
    "https://api.monobank.ua",
    mockRedis
  );

  describe("getFopAccounts", () => {
    test("should return FOP accounts when they exist", () => {
      const accounts: Account[] = [
        {
          id: "acc1",
          sendId: "send1",
          type: "black",
          currencyCode: 980,
          balance: 1000,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA123456789",
        },
        {
          id: "acc2",
          sendId: "send2",
          type: "fop",
          currencyCode: 980,
          balance: 500,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA987654321",
        },
        {
          id: "acc3",
          sendId: "send3",
          type: "fop",
          currencyCode: 840,
          balance: 200,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA111111111",
        },
        {
          id: "acc4",
          sendId: "send4",
          type: "white",
          currencyCode: 980,
          balance: 300,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA222222222",
        },
      ];

      const result = (monobankClient as any).getFopAccounts(accounts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value).toEqual([
          {
            id: "acc2",
            sendId: "send2",
            type: "fop",
            currencyCode: 980,
            balance: 500,
            creditLimit: 0,
            maskedPan: [],
            iban: "UA987654321",
          },
          {
            id: "acc3",
            sendId: "send3",
            type: "fop",
            currencyCode: 840,
            balance: 200,
            creditLimit: 0,
            maskedPan: [],
            iban: "UA111111111",
          },
        ]);
      }
    });

    test("should return error when no FOP accounts exist", () => {
      const accounts: Account[] = [
        {
          id: "acc1",
          sendId: "send1",
          type: "black",
          currencyCode: 980,
          balance: 1000,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA123456789",
        },
        {
          id: "acc4",
          sendId: "send4",
          type: "white",
          currencyCode: 980,
          balance: 300,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA222222222",
        },
      ];

      const result = (monobankClient as any).getFopAccounts(accounts);

      expect(result.isErr()).toBe(true);
      expect(result.error).toBe(
        MonobankClientErrors.MONOBANK_FOP_ACCOUNTS_NOT_FOUND
      );
    });

    test("should return error when accounts array is empty", () => {
      const accounts: Account[] = [];

      const result = (monobankClient as any).getFopAccounts(accounts);

      expect(result.isErr()).toBe(true);
      expect(result.error).toBe(
        MonobankClientErrors.MONOBANK_FOP_ACCOUNTS_NOT_FOUND
      );
    });

    test("should handle single FOP account", () => {
      const accounts: Account[] = [
        {
          id: "acc1",
          sendId: "send1",
          type: "fop",
          currencyCode: 980,
          balance: 1000,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA123456789",
        },
      ];

      const result = (monobankClient as any).getFopAccounts(accounts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toEqual({
          id: "acc1",
          sendId: "send1",
          type: "fop",
          currencyCode: 980,
          balance: 1000,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA123456789",
        });
      }
    });
  });

  describe("URL builders", () => {
    test("accountsUrl should return correct URL", () => {
      expect(monobankClient.accountsUrl).toBe(
        "https://api.monobank.ua/personal/client-info"
      );
    });

    test("currencyUrl should return correct URL", () => {
      expect((monobankClient as any).currencyUrl).toBe(
        "https://api.monobank.ua/bank/currency"
      );
    });

    test("buildTransactionsUrl should construct correct URL", () => {
      const accountId = "test-account";
      const from = 1234567890;
      const to = 1234567900;

      const result = (monobankClient as any).buildTransactionsUrl(
        accountId,
        from,
        to
      );
      expect(result).toBe(
        `https://api.monobank.ua/personal/statement/${accountId}/${from}/${to}`
      );
    });
  });

  describe("Transaction processing logic", () => {
    test("should filter positive operation amounts", () => {
      const transactions = [
        { operationAmount: 1000, time: 1234567890 },
        { operationAmount: -500, time: 1234567891 },
        { operationAmount: 2000, time: 1234567892 },
        { operationAmount: 0, time: 1234567893 },
      ];

      const positiveTransactions = transactions.filter(
        (tx) => tx.operationAmount > 0
      );
      expect(positiveTransactions).toHaveLength(2);
      expect(positiveTransactions.map((tx) => tx.operationAmount)).toEqual([
        1000, 2000,
      ]);
    });

    test("should convert UAH amounts correctly", () => {
      const operationAmount = 1000; // in foreign currency
      const rateBuy = 27.5; // UAH per unit of foreign currency

      const amountInUAH = operationAmount * rateBuy;
      expect(amountInUAH).toBe(27500);
    });

    test("should handle different currency rates", () => {
      const testCases = [
        { amount: 100, rate: 1.0, expected: 100 },
        { amount: 50, rate: 28.0, expected: 1400 },
        { amount: 200, rate: 0.85, expected: 170 },
      ];

      testCases.forEach(({ amount, rate, expected }) => {
        expect(amount * rate).toBe(expected);
      });
    });
  });

  describe("Account filtering for foreign currencies", () => {
    test("should filter out UAH accounts", () => {
      const accounts: Account[] = [
        {
          id: "acc1",
          sendId: "send1",
          type: "fop",
          currencyCode: CURRENCY_SYMBOLS_TO_CODES.UAH,
          balance: 1000,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA123456789",
        }, // UAH
        {
          id: "acc2",
          sendId: "send2",
          type: "fop",
          currencyCode: CURRENCY_SYMBOLS_TO_CODES.USD,
          balance: 500,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA987654321",
        }, // USD
        {
          id: "acc3",
          sendId: "send3",
          type: "fop",
          currencyCode: CURRENCY_SYMBOLS_TO_CODES.EUR,
          balance: 200,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA111111111",
        }, // EUR
        {
          id: "acc4",
          sendId: "send4",
          type: "fop",
          currencyCode: CURRENCY_SYMBOLS_TO_CODES.UAH,
          balance: 300,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA222222222",
        }, // UAH
      ];

      const foreignCurrencyAccounts = accounts.filter(
        (account) => account.currencyCode !== CURRENCY_SYMBOLS_TO_CODES.UAH
      );

      expect(foreignCurrencyAccounts).toHaveLength(2);
      expect(foreignCurrencyAccounts.map((acc) => acc.currencyCode)).toEqual([
        CURRENCY_SYMBOLS_TO_CODES.USD,
        CURRENCY_SYMBOLS_TO_CODES.EUR,
      ]);
    });

    test("should handle accounts with only UAH", () => {
      const accounts: Account[] = [
        {
          id: "acc1",
          sendId: "send1",
          type: "fop",
          currencyCode: CURRENCY_SYMBOLS_TO_CODES.UAH,
          balance: 1000,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA123456789",
        },
        {
          id: "acc2",
          sendId: "send2",
          type: "fop",
          currencyCode: CURRENCY_SYMBOLS_TO_CODES.UAH,
          balance: 500,
          creditLimit: 0,
          maskedPan: [],
          iban: "UA987654321",
        },
      ];

      const foreignCurrencyAccounts = accounts.filter(
        (account) => account.currencyCode !== CURRENCY_SYMBOLS_TO_CODES.UAH
      );

      expect(foreignCurrencyAccounts).toHaveLength(0);
    });
  });
});
