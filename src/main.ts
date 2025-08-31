import { monobankClient } from "./monobank/client";
import { PERIOD_IN_MONTHS } from "./monobank/config";
import { CURRENCY_SYMBOLS_TO_CODES } from "./monobank/const";

async function main() {
  const accounts = await monobankClient.getAccounts();

  if (!accounts) {
    throw new Error("Accounts not found");
  }

  const transactions = monobankClient.getIncomeByPeriod(
    accounts,
    CURRENCY_SYMBOLS_TO_CODES.EUR,
    PERIOD_IN_MONTHS
  );
}

main();
