import "dotenv/config";

export const PERIOD_IN_MONTHS = Number(process.env.PERIOD_IN_MONTHS || "3"); // Defaults to a regular tax quarter - 3 months;
export const MONOBANK_API_TOKEN = process.env.MONOBANK_API_TOKEN;
export const MONOBANK_API_URL = "https://api.monobank.ua";
