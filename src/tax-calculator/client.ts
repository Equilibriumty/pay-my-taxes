import type { MonobankClient } from "../monobank/client";
import type { Transaction, CurrencyCode } from "../monobank/types";
import { CURRENCY_DENOMINATOR } from "./const";
import type { TaxCalculatorClientConfig } from "./types";
import type { RedisClient } from "bun";

export class TaxCalculatorClient {
  private readonly monobankClient: MonobankClient;
  private readonly taxRates: TaxCalculatorClientConfig;
  private readonly currencyDenominator = CURRENCY_DENOMINATOR;
  private readonly redis: RedisClient;
  private readonly CACHE_TTL = 1000 * 60 * 60;

  constructor(
    monobankClient: MonobankClient,
    taxRates: TaxCalculatorClientConfig,
    redis: RedisClient
  ) {
    this.monobankClient = monobankClient;
    this.taxRates = taxRates;
    this.redis = redis;
  }

  private calculateIncome(incomes: number[]) {
    const totalIncome = incomes.reduce((acc, income) => acc + income, 0);

    return totalIncome / this.currencyDenominator;
  }

  public async calculateIncomeByPeriod(monthsBack: number) {
    const cacheKey = `taxcalc:incomeByPeriod:${monthsBack}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    const accounts =
      await this.monobankClient.getAccountsWithForeignCurrencies();

    if (!accounts) {
      throw new Error("Accounts not found");
    }

    const incomes = await this.monobankClient.getIncomeByPeriod(
      accounts,
      monthsBack
    );

    if (!incomes) {
      throw new Error("Income not found");
    }

    const result = this.calculateIncome(incomes);
    await this.redis.set(cacheKey, JSON.stringify(result));
    await this.redis.expire(cacheKey, this.CACHE_TTL);
    return result;
  }

  public async calculateIncomeInTargetCurrency(
    normalizedIncome: number,
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode
  ) {
    const rate = await this.monobankClient.fetchCurrencyRateByCurrencyPair(
      fromCurrency,
      toCurrency
    );
    return normalizedIncome * rate.rateBuy;
  }

  public async calculateTaxesForLastMonths(
    fromCurrencyCode: CurrencyCode,
    targetCurrencyCode: CurrencyCode,
    monthsBack: number
  ) {
    const cacheKey = `taxcalc:taxesForLastMonths:${fromCurrencyCode}:${targetCurrencyCode}:${monthsBack}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    const incomeInFromCurrency = await this.calculateIncomeByPeriod(monthsBack);

    const convertedIncome = await this.calculateIncomeInTargetCurrency(
      incomeInFromCurrency,
      fromCurrencyCode,
      targetCurrencyCode
    );

    const taxes = this.calculateTaxes(convertedIncome);

    const result = { income: convertedIncome, taxes };
    await this.redis.set(cacheKey, JSON.stringify(result));
    await this.redis.expire(cacheKey, this.CACHE_TTL);
    return result;
  }

  public calculateTaxes(income: number) {
    return {
      general: income * this.taxRates.general,
      military: income * this.taxRates.military,
    };
  }
}
