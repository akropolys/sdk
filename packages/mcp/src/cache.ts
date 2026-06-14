import { createClient } from 'redis';
import { DBProperty, DBTool } from './db.js';

export interface CachedConfig {
  property: DBProperty;
  tools: DBTool[];
}

const redisUrl = process.env.UPSTASH_REDIS_URL;
export const redisClient = redisUrl ? createClient({ url: redisUrl }) : null;

if (redisClient) {
  redisClient.connect().catch(err => {
    console.error('Redis connection error:', err);
  });
}

export async function getCachedConfig(propertyId: string): Promise<CachedConfig | null> {
  if (!redisClient) {
    return null;
  }
  try {
    const cached = await redisClient.get(`mcp:config:${propertyId}`);
    if (cached) {
      return JSON.parse(cached) as CachedConfig;
    }
  } catch (err) {
    console.error('Redis cache get error:', err);
  }
  return null;
}

export async function setCachedConfig(propertyId: string, config: CachedConfig): Promise<void> {
  if (!redisClient) {
    return;
  }
  try {
    await redisClient.set(`mcp:config:${propertyId}`, JSON.stringify(config), {
      EX: 3600 // 1 hour TTL
    });
  } catch (err) {
    console.error('Redis cache set error:', err);
  }
}
