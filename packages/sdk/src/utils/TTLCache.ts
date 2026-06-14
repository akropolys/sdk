export class TTLCache<T> {
  private cache = new Map<T, number>();
  private ttl: number;

  constructor(ttlMs: number = 24 * 60 * 60 * 1000) {
    this.ttl = ttlMs;
  }

  add(key: T): void {
    this.cache.set(key, Date.now());
    this.evictExpired();
  }

  has(key: T): boolean {
    const timestamp = this.cache.get(key);
    if (timestamp === undefined) return false;

    if (Date.now() - timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}
