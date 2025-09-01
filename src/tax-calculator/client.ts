import type { MonobankClient } from "../monobank/client";
import type { Transaction, CurrencyCode } from "../monobank/types";
import { CURRENCY_DENOMINATOR } from "./const";
import type { TaxCalculatorClientConfig } from "./types";

export class TaxCalculatorClient {
  private readonly monobankClient: MonobankClient;
  private readonly taxRates: TaxCalculatorClientConfig;
  private readonly currencyDenominator = CURRENCY_DENOMINATOR;

  constructor(
    monobankClient: MonobankClient,
    taxRates: TaxCalculatorClientConfig
  ) {
    this.monobankClient = monobankClient;
    this.taxRates = taxRates;
  }

  private calculateIncome(incomes: number[]) {
    const totalIncome = incomes.reduce((acc, income) => acc + income, 0);

    return totalIncome / this.currencyDenominator;
  }

  public async calculateIncomeByPeriod(monthsBack: number) {
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

    return this.calculateIncome(incomes);
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
    const incomeInFromCurrency = await this.calculateIncomeByPeriod(monthsBack);

    const convertedIncome = await this.calculateIncomeInTargetCurrency(
      incomeInFromCurrency,
      fromCurrencyCode,
      targetCurrencyCode
    );

    const taxes = this.calculateTaxes(convertedIncome);

    return { income: convertedIncome, taxes };
  }

  public calculateTaxes(income: number) {
    return {
      general: income * this.taxRates.general,
      military: income * this.taxRates.military,
    };
  }
}
