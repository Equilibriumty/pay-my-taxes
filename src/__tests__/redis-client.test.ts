import { describe, expect, test, mock } from "bun:test";
import { RedisClient, RedisClientErrors } from "../redis/client";

// Mock the Bun RedisClient
const mockBunRedisClient = {
  connect: mock(() => Promise.resolve()),
  close: mock(() => {}),
  get: mock(() => Promise.resolve(null as string | null)),
  set: mock(() => Promise.resolve(1)),
  expire: mock(() => Promise.resolve(1)),
  onconnect: null as any,
};

describe("RedisClient", () => {
  let redisClient: RedisClient;

  // Setup before each test
  const setupRedisClient = () => {
    // Reset all mocks
    Object.values(mockBunRedisClient).forEach(mockFn => {
      if (typeof mockFn === 'function' && mockFn.mock) {
        mockFn.mockClear();
      }
    });

    // Create a new RedisClient with mocked Bun client
    redisClient = new RedisClient();
    // Override the private bunRedisClient with our mock
    (redisClient as any).bunRedisClient = mockBunRedisClient;
  };

  describe("connect", () => {
    test("should call connect on the bun redis client", async () => {
      setupRedisClient();
      await redisClient.connect();
      expect(mockBunRedisClient.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe("close", () => {
    test("should call close on the bun redis client", () => {
      setupRedisClient();
      redisClient.close();
      expect(mockBunRedisClient.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("get", () => {
    test("should return null when redis returns null", async () => {
      setupRedisClient();
      mockBunRedisClient.get.mockResolvedValue(null);

      const result = await redisClient.get("test-key");

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(null);
      }
      expect(mockBunRedisClient.get).toHaveBeenCalledWith("test-key");
    });

    test("should parse and return JSON data when redis returns a string", async () => {
      setupRedisClient();
      const testData = { income: 1000, taxes: { general: 50, military: 10, total: 60 } };
      const jsonString = JSON.stringify(testData);

      mockBunRedisClient.get.mockResolvedValue(jsonString);

      const result = await redisClient.get("test-key");

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(testData);
      }
      expect(mockBunRedisClient.get).toHaveBeenCalledWith("test-key");
    });

    test("should handle JSON parsing errors gracefully", async () => {
      setupRedisClient();
      mockBunRedisClient.get.mockResolvedValue("invalid json"); // Invalid JSON

      const result = await redisClient.get("test-key");

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("invalid json");
      }
    });
  });

  describe("set", () => {
    test("should stringify data and set with expiration", async () => {
      setupRedisClient();
      const testData = { income: 1000, taxes: { general: 50, military: 10, total: 60 } };
      const expectedJsonString = JSON.stringify(testData);

      const result = await redisClient.set("test-key", testData);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(1);
      }
      expect(mockBunRedisClient.set).toHaveBeenCalledWith("test-key", expectedJsonString);
      expect(mockBunRedisClient.expire).toHaveBeenCalledWith("test-key", 3600000); // Default CACHE_TTL (1 hour)
    });

    test("should handle expiration setting failure", async () => {
      setupRedisClient();
      mockBunRedisClient.expire.mockResolvedValue(0); // Redis expire returns 0 on failure

      const result = await redisClient.set("test-key", "test-data");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(RedisClientErrors.REDIS_CLIENT_FAILED_TO_SET_EXPIRATION);
      }
    });

    test("should handle complex objects", async () => {
      setupRedisClient();
      mockBunRedisClient.expire.mockResolvedValue(1); // Ensure expire succeeds

      const complexData = {
        accounts: [
          { id: "acc1", currencyCode: 980, balance: 1000 },
          { id: "acc2", currencyCode: 840, balance: 500 }
        ],
        transactions: [
          { id: "tx1", amount: 100, time: 1234567890 },
          { id: "tx2", amount: -50, time: 1234567900 }
        ]
      };

      const result = await redisClient.set("complex-key", complexData);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(1);
      }
      expect(mockBunRedisClient.set).toHaveBeenCalledWith("complex-key", JSON.stringify(complexData));
    });
  });
});