import { RedisClient as BunRedisClient } from "bun";
import { REDIS_CACHE_TTL, REDIS_URL } from "./config";
import { err, errAsync, ok, okAsync, ResultAsync } from "neverthrow";

export enum RedisClientErrors {
  REDIS_CLIENT_FAILED_TO_SET = "REDIS_CLIENT_FAILED_TO_SET",
  REDIS_CLIENT_FAILED_TO_GET = "REDIS_CLIENT_FAILED_TO_GET",
  REDIS_CLIENT_FAILED_TO_SET_EXPIRATION = "REDIS_CLIENT_FAILED_TO_SET_EXPIRATION",
}
export class RedisClient {
  private readonly CACHE_TTL = REDIS_CACHE_TTL;
  private readonly bunRedisClient: BunRedisClient = new BunRedisClient(
    REDIS_URL
  );
  constructor() {
    this.bunRedisClient.onconnect = () => {
      console.log("RedisClient connected");
    };
  }

  async connect() {
    await this.bunRedisClient.connect();
  }

  close() {
    this.bunRedisClient.close();
  }

  get<T>(key: string): ResultAsync<T | null, never> {
    const cachedData = ResultAsync.fromSafePromise(
      this.bunRedisClient.get(key)
    ).andThen((cachedData) => {
      if (!cachedData) {
        return okAsync(null);
      }
      try {
        return okAsync(JSON.parse(cachedData) as T);
      } catch {
        // If JSON parsing fails, return the raw string
        return okAsync(cachedData as T);
      }
    });
    return cachedData;
  }

  set<T>(
    key: BunRedisClient.KeyLike,
    value: T
  ): ResultAsync<number, RedisClientErrors> {
    const stringValue = JSON.stringify(value);
    return ResultAsync.fromSafePromise(
      this.bunRedisClient.set(key, stringValue)
    ).andThen(() => {
      return ResultAsync.fromSafePromise(
        this.bunRedisClient.expire(key, this.CACHE_TTL)
      ).andThen((expiry) => {
        if (expiry === 0) {
          return errAsync(
            RedisClientErrors.REDIS_CLIENT_FAILED_TO_SET_EXPIRATION
          );
        }
        return okAsync(expiry);
      });
    });
  }
}

export const redisClient = new RedisClient();
