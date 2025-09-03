import { RedisClient as BunRedisClient } from "bun";
import { REDIS_CACHE_TTL, REDIS_URL } from "./config";

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

  async get<T>(key: string) {
    try {
      const cachedData = await this.bunRedisClient.get(key);

      if (!cachedData) {
        return null;
      }

      return JSON.parse(cachedData) as T;
    } catch (error) {
      console.error("errRedisClient: Failed to get value from cache", error);
      return null;
    }
  }

  async set<T>(key: BunRedisClient.KeyLike, value: T) {
    try {
      const stringValue = JSON.stringify(value);
      await this.bunRedisClient.set(key, stringValue);
      await this.bunRedisClient.expire(key, this.CACHE_TTL);
    } catch (error) {
      console.error("errRedisClient: Failed to set value to cache", error);
    }
  }
}
