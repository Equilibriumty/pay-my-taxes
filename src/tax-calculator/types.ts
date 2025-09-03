export type TaxCalculatorClientConfig = {
  general: number;
  military: number;
};

export type IncomeAndTaxesCalculationResult = {
  income: number;
  taxes: {
    general: number;
    military: number;
  };
};
