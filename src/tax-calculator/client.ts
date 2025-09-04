import type { BankClient } from "../bank/client";
import type { RedisClient } from "../redis/client";
import type { Period } from "../shared/types";
import { CURRENCY_DENOMINATOR } from "./const";
import type {
  IncomeAndTaxesCalculationResult,
  TaxCalculatorClientConfig,
} from "./types";

export class TaxCalculatorClient {
  private readonly bankClient: BankClient;
  private readonly taxRates: TaxCalculatorClientConfig;
  private readonly currencyDenominator = CURRENCY_DENOMINATOR;
  private readonly redis: RedisClient;

  constructor(
    bankClient: BankClient,
    taxRates: TaxCalculatorClientConfig,
    redis: RedisClient
  ) {
    this.bankClient = bankClient;
    this.taxRates = taxRates;
    this.redis = redis;
  }

  private calculateIncome(incomes: number[]) {
    const totalIncome = incomes.reduce((acc, income) => acc + income, 0);

    return totalIncome / this.currencyDenominator;
  }

  public async calculateIncomeByPeriod(
    period: Period
  ): Promise<IncomeAndTaxesCalculationResult> {
    const cacheKey = `taxcalc:incomeByPeriod:${period}`;
    const cached = await this.redis.get<IncomeAndTaxesCalculationResult>(
      cacheKey
    );

    if (cached) {
      return cached;
    }

    const incomes = await this.bankClient.getIncomeByPeriod(period);

    if (!incomes) {
      throw new Error("Income not found");
    }

    const incomeInCurrency = this.calculateIncome(incomes);
    const taxes = this.calculateTaxes(incomeInCurrency);
    const result = { income: incomeInCurrency, taxes };

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
