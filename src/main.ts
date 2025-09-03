import { MonobankClient } from "./monobank/client";
import { MONOBANK_API_TOKEN, PERIOD_IN_MONTHS } from "./monobank/config";
import {
  CURRENCY_CODES_TO_SYMBOLS,
  CURRENCY_SYMBOLS_TO_CODES,
} from "./monobank/const";
import { RedisClient } from "./redis/client";
import { TaxCalculatorClient } from "./tax-calculator/client";
import type { TaxCalculatorClientConfig } from "./tax-calculator/types";

const TAX_RATES: TaxCalculatorClientConfig = {
  general: 0.05, // 5%
  military: 0.01, // 1%
};

if (!MONOBANK_API_TOKEN) {
  throw new Error("MONOBANK_API_TOKEN is not defined");
}

const redisClient = new RedisClient();

const monobankClient = new MonobankClient(MONOBANK_API_TOKEN, redisClient);
const taxCalculatorClient = new TaxCalculatorClient(
  monobankClient,
  TAX_RATES,
  redisClient
);

async function main() {
  await redisClient.connect();
  const { income, taxes } =
    await taxCalculatorClient.calculateTaxesForLastMonths(PERIOD_IN_MONTHS);

  console.log(
    `За останні ${PERIOD_IN_MONTHS} міс. дохід: ${income} ${
      CURRENCY_CODES_TO_SYMBOLS[CURRENCY_SYMBOLS_TO_CODES.UAH]
    }`
  );

  const militaryTaxLabel = `Військовий податок ${TAX_RATES.military * 100}%`;
  const generalTaxLabel = `Загальний податок ${TAX_RATES.general * 100}%`;

  console.table([
    {
      [militaryTaxLabel]: taxes.military,
      [generalTaxLabel]: taxes.general,
    },
  ]);
  redisClient.close();
}

main();
