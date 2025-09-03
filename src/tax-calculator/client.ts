import type { MonobankClient } from "../monobank/client";
import type { Transaction, CurrencyCode } from "../monobank/types";
import type { RedisClient } from "../redis/client";
import { CURRENCY_DENOMINATOR } from "./const";
import type {
  IncomeAndTaxesCalculationResult,
  TaxCalculatorClientConfig,
} from "./types";

export class TaxCalculatorClient {
  private readonly monobankClient: MonobankClient;
  private readonly taxRates: TaxCalculatorClientConfig;
  private readonly currencyDenominator = CURRENCY_DENOMINATOR;
  private readonly redis: RedisClient;

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
    const cached = await this.redis.get<number>(cacheKey);
    if (cached) {
      return cached;
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
    await this.redis.set(cacheKey, result);
    return result;
  }

  public async calculateTaxesForLastMonths(monthsBack: number) {
    const cacheKey = `taxcalc:taxesForLastMonths:${monthsBack}`;
    const cached = await this.redis.get<IncomeAndTaxesCalculationResult>(
      cacheKey
    );
    if (cached) {
      return cached;
    }
    const incomeInFromCurrency = await this.calculateIncomeByPeriod(monthsBack);

    const taxes = this.calculateTaxes(incomeInFromCurrency);

    const result = { income: incomeInFromCurrency, taxes };
    await this.redis.set(cacheKey, result);
    return result;
  }

  public calculateTaxes(income: number) {
    return {
      general: income * this.taxRates.general,
      military: income * this.taxRates.military,
    };
  }
}
