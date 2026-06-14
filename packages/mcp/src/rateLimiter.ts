export class McpRateLimiter {
  private client: any;
  private limit: number;
  private windowSeconds: number;

  constructor(redisClient: any, limit = 100, windowSeconds = 60) {
    this.client = redisClient;
    this.limit = limit;
    this.windowSeconds = windowSeconds;
  }

  async assertAllowed(propertyId: string): Promise<void> {
    if (!this.client) {
      // Redis not configured — fail closed: deny the request.
      // Without rate limiting we cannot safely allow agent traffic.
      throw new Error('Rate limiting is not configured (Redis unavailable). Request denied.');
    }

    const key = `mcp:ratelimit:${propertyId}`;

    // Propagate ALL errors — never silently bypass.
    const current = await this.client.incr(key);
    if (current === 1) {
      await this.client.expire(key, this.windowSeconds);
    }
    if (current > this.limit) {
      throw new Error(
        `Rate limit exceeded: property "${propertyId}" has exceeded the limit of ${this.limit} requests per ${this.windowSeconds} seconds.`
      );
    }
  }
}
