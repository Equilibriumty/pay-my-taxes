import { monobankClient } from "./monobank/client";
import { PERIOD_IN_MONTHS } from "./monobank/config";
import {
  CURRENCY_CODES_TO_SYMBOLS,
  CURRENCY_SYMBOLS_TO_CODES,
} from "./monobank/const";

const TARGET_CURRENCY = CURRENCY_SYMBOLS_TO_CODES.UAH;

async function main() {
  const accounts = await monobankClient.getAccounts();

  if (!accounts) {
    throw new Error("Accounts not found");
  }

  const income = await monobankClient.getIncomeByPeriod(
    accounts,
    CURRENCY_SYMBOLS_TO_CODES.EUR,
    PERIOD_IN_MONTHS
  );

  const convertedIncome = await monobankClient.calculateIncomeInTargetCurrency(
    income,
    CURRENCY_SYMBOLS_TO_CODES.EUR,
    CURRENCY_SYMBOLS_TO_CODES.UAH
  );

  console.log(
    `Income in ${CURRENCY_CODES_TO_SYMBOLS[TARGET_CURRENCY]}: ${convertedIncome}`
  );
}

main();
