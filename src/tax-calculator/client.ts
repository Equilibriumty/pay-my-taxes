import type { BankClient } from "../bank/client";
import type { RedisClient } from "../redis/client";
import type { Period } from "../shared/types";
import { CURRENCY_DENOMINATOR } from "./const";
import type {
  IncomeAndTaxesCalculationResult,
  TaxCalculatorClientConfig,
} from "./types";

export class TaxCalculatorClient {
  private readonly bankClients: Set<BankClient>;
  private readonly taxRates: TaxCalculatorClientConfig;
  private readonly currencyDenominator = CURRENCY_DENOMINATOR;
  private readonly redis: RedisClient;

  constructor(
    bankClients: Set<BankClient>,
    taxRates: TaxCalculatorClientConfig,
    redis: RedisClient
  ) {
    this.bankClients = bankClients;
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
    const totalIncomeAndTaxesCalculationResult: IncomeAndTaxesCalculationResult =
      {
        totalIncome: 0,
        taxes: {
          general: 0,
          military: 0,
          total: 0,
        },
      };

    for (const bankClient of this.bankClients) {
      console.log(`Calculating income for ${bankClient.bankId}`);

      const cacheKey = `taxcalc:incomeByPeriod:${period}:${bankClient.bankId}`;
      const cached = await this.redis.get<IncomeAndTaxesCalculationResult>(
        cacheKey
      );

      if (cached) {
        totalIncomeAndTaxesCalculationResult.totalIncome += cached.totalIncome;
        totalIncomeAndTaxesCalculationResult.taxes.general +=
          cached.taxes.general;
        totalIncomeAndTaxesCalculationResult.taxes.military +=
          cached.taxes.military;
        totalIncomeAndTaxesCalculationResult.taxes.total += cached.taxes.total;
        continue;
      }

      const incomes = await bankClient.getIncomeByPeriod(period);

      if (!incomes) {
        throw new Error("Income not found");
      }

      const incomeInCurrency = this.calculateIncome(incomes);
      const taxes = this.calculateTaxes(incomeInCurrency);
      const result = { income: incomeInCurrency, taxes };

      await this.redis.set(cacheKey, result);
      totalIncomeAndTaxesCalculationResult.totalIncome += incomeInCurrency;
      totalIncomeAndTaxesCalculationResult.taxes.general += taxes.general;
      totalIncomeAndTaxesCalculationResult.taxes.military += taxes.military;
      totalIncomeAndTaxesCalculationResult.taxes.total += taxes.total;
    }

    return totalIncomeAndTaxesCalculationResult;
  }

  public calculateTaxes(income: number) {
    return {
      general: income * this.taxRates.general,
      military: income * this.taxRates.military,
      total: income * (this.taxRates.general + this.taxRates.military),
    };
  }
}
