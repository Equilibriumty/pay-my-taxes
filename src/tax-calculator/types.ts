export type TaxCalculatorClientConfig = {
  general: number;
  military: number;
};

export type IncomeAndTaxesCalculationResult = {
  totalIncome: number;
  taxes: {
    general: number;
    military: number;
    total: number;
  };
};
