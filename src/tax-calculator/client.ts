import { Ok, ok, ResultAsync } from "neverthrow";
import type { BankClient } from "../bank/client";
import type { RedisClient } from "../redis/client";
import type { Period } from "../shared/types";
import { CURRENCY_DENOMINATOR } from "./const";
import type {
  IncomeAndTaxesCalculationResult,
  TaxCalculatorClientConfig,
} from "./types";

export enum TaxCalculatorClientErrors {
  FAILED_TO_FETCH_INCOME = "FAILED_TO_FETCH_INCOME",
  TAXES_NOT_FOUND = "TAXES_NOT_FOUND",
  TAXES_NOT_CALCULATED = "TAXES_NOT_CALCULATED",
}

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

  private calculateIncome(incomes: number[]): Ok<number, never> {
    const totalIncome = incomes.reduce((acc, income) => acc + income, 0);

    return ok(totalIncome / this.currencyDenominator);
  }

  public calculateIncomeByPeriod(
    period: Period
  ): ResultAsync<
    IncomeAndTaxesCalculationResult | null,
    TaxCalculatorClientErrors
  > {
    return this.calculateIncomeByPeriodAsync(period);
  }

  private calculateIncomeByPeriodAsync(
    period: Period
  ): ResultAsync<
    IncomeAndTaxesCalculationResult | null,
    TaxCalculatorClientErrors
  > {
    const totalIncomeAndTaxesCalculationResult: IncomeAndTaxesCalculationResult =
      {
        totalIncome: 0,
        taxes: {
          general: 0,
          military: 0,
          total: 0,
        },
      };

    // Process each bank client sequentially
    const processBankClients =
      async (): Promise<IncomeAndTaxesCalculationResult | null> => {
        for (const bankClient of this.bankClients) {
          console.log(`Calculating income for ${bankClient.bankId}`);

          const cacheKey = `taxcalc:incomeByPeriod:${period}:${bankClient.bankId}`;
          const cached = await this.redis.get<IncomeAndTaxesCalculationResult>(
            cacheKey
          );

          if (cached.isOk() && cached.value !== null) {
            totalIncomeAndTaxesCalculationResult.totalIncome +=
              cached.value.totalIncome;
            totalIncomeAndTaxesCalculationResult.taxes.general +=
              cached.value.taxes.general;
            totalIncomeAndTaxesCalculationResult.taxes.military +=
              cached.value.taxes.military;
            totalIncomeAndTaxesCalculationResult.taxes.total +=
              cached.value.taxes.total;
            continue;
          }

          const incomes = await bankClient.getIncomeByPeriod(period);

          if (incomes.isErr()) {
            console.error("Error fetching income", incomes.error);
            return null;
          }

          const incomeInCurrency = this.calculateIncome(incomes.value);
          const taxes = this.calculateTaxes(incomeInCurrency.value);
          const result = { income: incomeInCurrency.value, taxes: taxes.value };

          await this.redis.set(cacheKey, result);
          totalIncomeAndTaxesCalculationResult.totalIncome +=
            incomeInCurrency.value;
          totalIncomeAndTaxesCalculationResult.taxes.general +=
            taxes.value.general;
          totalIncomeAndTaxesCalculationResult.taxes.military +=
            taxes.value.military;
          totalIncomeAndTaxesCalculationResult.taxes.total += taxes.value.total;
        }

        return totalIncomeAndTaxesCalculationResult;
      };

    return ResultAsync.fromSafePromise(processBankClients());
  }

  public calculateTaxes(
    income: number
  ): Ok<IncomeAndTaxesCalculationResult["taxes"], never> {
    return ok({
      general: income * this.taxRates.general,
      military: income * this.taxRates.military,
      total: income * (this.taxRates.general + this.taxRates.military),
    });
  }
}
