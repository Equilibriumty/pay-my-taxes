export const REDIS_URL = process.env.REDIS_URL;
export const REDIS_CACHE_TTL =
  Number(process.env.REDIS_CACHE_TTL) || 1000 * 60 * 60;
