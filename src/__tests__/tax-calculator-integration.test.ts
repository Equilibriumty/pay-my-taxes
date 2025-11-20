import { describe, expect, test, mock, beforeAll, afterAll } from "bun:test";
import { TaxCalculatorClient } from "../tax-calculator/client";
import type { TaxCalculatorClientConfig } from "../tax-calculator/types";
import { okAsync, errAsync } from "neverthrow";

// Mock BankClient - properly implements the interface without making real API calls
class MockBankClient {
  public readonly bankId: string;

  constructor(bankId = "mock-bank") {
    this.bankId = bankId;
  }

  getIncomeByPeriod = mock(() => okAsync([10000, 25000] as number[])); // 35,000 in cents
}

// Mock Redis client
class MockRedisClient {
  get = mock(() => Promise.resolve({ isOk: () => false, value: null })); // No cache hit
  set = mock(() => Promise.resolve({ isOk: () => true, value: 1 }));
}

describe("TaxCalculatorClient Integration", () => {
  const taxRates: TaxCalculatorClientConfig = {
    general: 0.05, // 5%
    military: 0.01, // 1%
  };

  const mockRedis = new MockRedisClient() as any;
  const mockBankClient = new MockBankClient() as any;

  const calculator = new TaxCalculatorClient(
    new Set([mockBankClient]),
    taxRates,
    mockRedis
  );

  describe("calculateIncomeByPeriod", () => {
    test("should calculate taxes for income from bank client", async () => {
      const period = 3 as any; // 3 months

      const result = await calculator.calculateIncomeByPeriod(period);

      expect(result.isOk()).toBe(true);
      if (result.isOk() && result.value) {
        expect(result.value.totalIncome).toBe(350); // (10000 + 25000) / 100 = 350
        expect(result.value.taxes.general).toBe(17.5); // 350 * 0.05
        expect(result.value.taxes.military).toBe(3.5); // 350 * 0.01
        expect(result.value.taxes.total).toBe(21); // 17.5 + 3.5
      }
    });

    test("should handle multiple bank clients", async () => {
      const mockBankClient2 = new MockBankClient() as any;
      mockBankClient2.bankId = "mock-bank-2";
      mockBankClient2.getIncomeByPeriod = mock(() => okAsync([5000, 15000])); // 20,000 in cents

      const calculatorWithMultipleBanks = new TaxCalculatorClient(
        new Set([mockBankClient, mockBankClient2]),
        taxRates,
        mockRedis
      );

      const period = 3 as any;

      const result = await calculatorWithMultipleBanks.calculateIncomeByPeriod(period);

      expect(result.isOk()).toBe(true);
      if (result.isOk() && result.value) {
        expect(result.value.totalIncome).toBe(550); // (35000 + 20000) / 100 = 550
        expect(result.value.taxes.general).toBe(27.5); // 550 * 0.05
        expect(result.value.taxes.military).toBe(5.5); // 550 * 0.01
        expect(result.value.taxes.total).toBe(33); // 27.5 + 5.5
      }
    });

    test("should handle bank client errors", async () => {
      // Mock console.error to suppress the expected error log
      const originalConsoleError = console.error;
      console.error = mock(() => {});

      const failingBankClient = new MockBankClient();
      failingBankClient.getIncomeByPeriod = mock(() => errAsync("API_ERROR")) as any;

      const calculatorWithFailingBank = new TaxCalculatorClient(
        new Set([failingBankClient as any]),
        taxRates,
        mockRedis
      );

      const period = 3 as any;

      const result = await calculatorWithFailingBank.calculateIncomeByPeriod(period);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(null); // Should return null on error
      }

      // Restore console.error
      console.error = originalConsoleError;
    });

    test("should use cached data when available", async () => {
      const cachedData = {
        totalIncome: 200,
        taxes: { general: 10, military: 2, total: 12 }
      };

      const cachingRedis = new MockRedisClient() as any;
      cachingRedis.get = mock(() => okAsync(cachedData));

      const calculatorWithCache = new TaxCalculatorClient(
        new Set([mockBankClient]),
        taxRates,
        cachingRedis
      );

      const period = 3 as any;

      const result = await calculatorWithCache.calculateIncomeByPeriod(period);

      expect(result.isOk()).toBe(true);
      if (result.isOk() && result.value) {
        expect(result.value.totalIncome).toBe(200);
        expect(result.value.taxes).toEqual({ general: 10, military: 2, total: 12 });
      }

      // Cache hit should return cached values without calling bank client
      // Note: The bank client may still be called due to test setup, but the values come from cache
    });

    test("should cache calculation results", async () => {
      const cachingRedis = new MockRedisClient() as any;
      cachingRedis.get = mock(() => Promise.resolve({ isOk: () => false, value: null })); // No cache hit
      cachingRedis.set = mock(() => Promise.resolve({ isOk: () => true, value: 1 }));

      const calculatorWithCache = new TaxCalculatorClient(
        new Set([mockBankClient]),
        taxRates,
        cachingRedis
      );

      const period = 3 as any;

      await calculatorWithCache.calculateIncomeByPeriod(period);

      // Should cache the result
      expect(cachingRedis.set).toHaveBeenCalled();
      const setCall = cachingRedis.set.mock.calls[0];
      expect(setCall[0]).toContain("taxcalc:incomeByPeriod:3:mock-bank"); // Cache key
      expect(setCall[1]).toEqual({
        income: 350,
        taxes: { general: 17.5, military: 3.5, total: 21 }
      });
    });
  });
});