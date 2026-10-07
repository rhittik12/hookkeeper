import ioredis from "ioredis";
import "dotenv/config";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL is not defined in the environment variables.");
}

export const redisConnection = new ioredis(redisUrl,{maxRetriesPerRequest: null});