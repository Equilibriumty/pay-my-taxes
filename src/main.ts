import { monobankClient } from "./bank/monobank/client";
// currency consts might be moved to the shared folder since they follow ISO 4217 standard
import {
  CURRENCY_CODES_TO_SYMBOLS,
  CURRENCY_SYMBOLS_TO_CODES,
} from "./bank/monobank/const";
import { redisClient } from "./redis/client";
import type { Months } from "./shared/types";
import { TaxCalculatorClient } from "./tax-calculator/client";
import type { TaxCalculatorClientConfig } from "./tax-calculator/types";

const TAX_RATES: TaxCalculatorClientConfig = {
  general: 0.05, // 5%
  military: 0.01, // 1%
};

export const PERIOD_IN_MONTHS = Number(
  process.env.PERIOD_IN_MONTHS || "3"
) as Months; // Defaults to a regular tax quarter - 3 months;

const bankClients = new Set([monobankClient]);

const taxCalculatorClient = new TaxCalculatorClient(
  bankClients,
  TAX_RATES,
  redisClient
);

async function main() {
  await redisClient.connect();
  const { totalIncome, taxes } =
    await taxCalculatorClient.calculateIncomeByPeriod(PERIOD_IN_MONTHS);

  const militaryTaxLabel = `Військовий податок ${TAX_RATES.military * 100}%`;
  const generalTaxLabel = `Загальний податок ${TAX_RATES.general * 100}%`;
  const totalTaxLabel = `Загалом до сплати`;

  console.log(
    `За останні ${PERIOD_IN_MONTHS} міс. дохід: ${totalIncome} ${
      CURRENCY_CODES_TO_SYMBOLS[CURRENCY_SYMBOLS_TO_CODES.UAH]
    }`
  );

  console.table([
    {
      [militaryTaxLabel]: taxes.military,
      [generalTaxLabel]: taxes.general,
      [totalTaxLabel]: taxes.total,
    },
  ]);
  redisClient.close();
}

main();
