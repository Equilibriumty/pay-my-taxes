import type { CURRENCY_CODES_TO_SYMBOLS } from "./const";

export type CashbackType = "UAH" | "None";

export type CurrencyCode = keyof typeof CURRENCY_CODES_TO_SYMBOLS;

export type Jar = {
  id: string;
  sendId: string;
  title: string;
  description: string;
  currencyCode: CurrencyCode;
  balance: number;
  goal?: number;
};

export type AccountType = "fop" | "eAid" | "madeInUkraine" | "black" | "white";

export type Account = {
  id: string;
  sendId: string;
  currencyCode: CurrencyCode;
  balance: number;
  creditLimit: number;
  maskedPan: Array<string>;
  type: AccountType;
  iban: string;
  cashbackType?: CashbackType;
};

export type PersonalInfo = {
  clientId: string;
  name: string;
  webHookUrl: string;
  permissions: string;
  accounts: Array<Account>;
  jars: Array<Jar>;
};

export type Transaction = {
  id: string;
  time: number;
  description: string;
  mcc: number;
  originalMcc: number;
  amount: number;
  operationAmount: number;
  currencyCode: CurrencyCode;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  hold: boolean;
  counterEdrpou?: string;
  counterIban?: string;
  counterName: string;
};

export type Currency = {
  currencyCodeA: CurrencyCode;
  currencyCodeB: CurrencyCode;
  date: number;
  rateSell: number;
  rateBuy: number;
  rateCross: number;
};
