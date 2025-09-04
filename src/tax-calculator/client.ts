import type { MonobankClient } from "../bank/monobank/client";
import type { RedisClient } from "../redis/client";
import type { Months, Period } from "../shared/types";
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

  public async calculateIncomeByPeriod(period: Period) {
    const cacheKey = `taxcalc:incomeByPeriod:${period}`;
    const cached = await this.redis.get<number>(cacheKey);
    if (cached) {
      return cached;
    }

    const incomes = await this.monobankClient.getIncomeByPeriod(period);

    if (!incomes) {
      throw new Error("Income not found");
    }

    const result = this.calculateIncome(incomes);
    await this.redis.set(cacheKey, result);
    return result;
  }

  public async calculateTaxesForLastMonths(monthsBack: Months) {
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
