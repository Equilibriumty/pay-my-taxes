import type { Result, ResultAsync } from "neverthrow";
import type { RedisClient, RedisClientErrors } from "../redis/client";
import type { Period } from "../shared/types";

interface IBankClient {
  getIncomeByPeriod(period: Period): ResultAsync<number[], string | RedisClientErrors>;
}

export abstract class BankClient implements IBankClient {
  public readonly bankId: string;
  protected readonly BANK_API_TOKEN: string;
  protected readonly BANK_API_URL: string;
  protected readonly redis: RedisClient;

  constructor(
    bankId: string,
    BANK_API_TOKEN: string,
    BANK_API_URL: string,
    redis: RedisClient
  ) {
    this.bankId = bankId;
    this.BANK_API_TOKEN = BANK_API_TOKEN;
    this.BANK_API_URL = BANK_API_URL;
    this.redis = redis;
  }

  public abstract getIncomeByPeriod(
    period: Period
  ): ResultAsync<number[], string | RedisClientErrors>;
}
