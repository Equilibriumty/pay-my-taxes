import { describe, expect, test } from "bun:test";
import { TaxCalculatorClient } from "../tax-calculator/client";
import type { TaxCalculatorClientConfig } from "../tax-calculator/types";

// Mock Redis client for testing
class MockRedisClient {
  async get() {
    return { isOk: () => false, value: null };
  }
  async set() {
    return { isOk: () => true, value: 1 };
  }
}

describe("TaxCalculatorClient", () => {
  const mockRedis = new MockRedisClient() as any;
  const taxRates: TaxCalculatorClientConfig = {
    general: 0.05, // 5%
    military: 0.01, // 1%
  };

  const calculator = new TaxCalculatorClient(
    new Set(),
    taxRates,
    mockRedis
  );

  describe("calculateTaxes", () => {
    test("should calculate taxes correctly for positive income", () => {
      const income = 1000;
      const result = calculator.calculateTaxes(income);

      expect(result.isOk()).toBe(true);
      expect(result.value.general).toBe(50);
      expect(result.value.military).toBe(10);
      expect(result.value.total).toBeCloseTo(60, 10);
    });

    test("should calculate taxes correctly for zero income", () => {
      const income = 0;
      const result = calculator.calculateTaxes(income);

      expect(result.isOk()).toBe(true);
      expect(result.value).toEqual({
        general: 0,
        military: 0,
        total: 0,
      });
    });

    test("should calculate taxes correctly for decimal income", () => {
      const income = 123.45;
      const result = calculator.calculateTaxes(income);

      expect(result.isOk()).toBe(true);
      expect(result.value.general).toBe(6.1725);
      expect(result.value.military).toBeCloseTo(1.2345, 10);
      expect(result.value.total).toBeCloseTo(7.407, 10);
    });

    test("should handle different tax rates correctly", () => {
      const customRates: TaxCalculatorClientConfig = {
        general: 0.10, // 10%
        military: 0.02, // 2%
      };

      const customCalculator = new TaxCalculatorClient(
        new Set(),
        customRates,
        mockRedis
      );

      const income = 500;
      const result = customCalculator.calculateTaxes(income);

      expect(result.isOk()).toBe(true);
      expect(result.value.general).toBe(50);
      expect(result.value.military).toBe(10);
      expect(result.value.total).toBeCloseTo(60, 10);
    });

    test("should handle very small tax rates", () => {
      const smallRates: TaxCalculatorClientConfig = {
        general: 0.001, // 0.1%
        military: 0.0005, // 0.05%
      };

      const smallCalculator = new TaxCalculatorClient(
        new Set(),
        smallRates,
        mockRedis
      );

      const income = 10000;
      const result = smallCalculator.calculateTaxes(income);

      expect(result.isOk()).toBe(true);
      expect(result.value).toEqual({
        general: 10, // 10000 * 0.001
        military: 5, // 10000 * 0.0005
        total: 15, // 10 + 5
      });
    });
  });

  describe("calculateIncome", () => {
    test("should sum incomes and divide by currency denominator", () => {
      const incomes = [10000, 25000, 5000]; // In cents
      const result = (calculator as any).calculateIncome(incomes);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(400); // (10000 + 25000 + 5000) / 100 = 400
    });

    test("should handle empty income array", () => {
      const incomes: number[] = [];
      const result = (calculator as any).calculateIncome(incomes);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(0);
    });

    test("should handle single income value", () => {
      const incomes = [50000];
      const result = (calculator as any).calculateIncome(incomes);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(500); // 50000 / 100 = 500
    });

    test("should handle decimal results from currency conversion", () => {
      const incomes = [12345, 67890];
      const result = (calculator as any).calculateIncome(incomes);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(802.35); // (12345 + 67890) / 100 = 802.35
    });

    test("should handle negative incomes (refunds)", () => {
      const incomes = [10000, -2000, 5000];
      const result = (calculator as any).calculateIncome(incomes);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(130); // (10000 - 2000 + 5000) / 100 = 130
    });

    test("should handle large income arrays", () => {
      const incomes = Array.from({ length: 100 }, (_, i) => (i + 1) * 1000);
      const expectedSum = incomes.reduce((acc, val) => acc + val, 0);
      const result = (calculator as any).calculateIncome(incomes);

      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(expectedSum / 100);
    });
  });
});