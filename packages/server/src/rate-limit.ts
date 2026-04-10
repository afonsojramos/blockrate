interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private capacity: number,
    private refillPerSecond: number,
  ) {}

  take(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key) ?? {
      tokens: this.capacity,
      updatedAt: now,
    };
    const elapsed = (now - b.updatedAt) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSecond);
    b.updatedAt = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }
}
