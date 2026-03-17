export class TokenBucketRateLimiter {
  constructor(requestsPerSecond, burst) {
    this.requestsPerSecond = Math.max(1, requestsPerSecond);
    this.capacity = Math.max(1, burst);
    this.tokens = this.capacity;
    this.lastRefillMs = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillMs) / 1000;
    if (elapsedSeconds <= 0) {
      return;
    }

    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.requestsPerSecond);
    this.lastRefillMs = now;
  }

  async acquire(tokenCount = 1) {
    const needed = Math.max(1, tokenCount);
    let waitedMs = 0;

    while (true) {
      this.refill();
      if (this.tokens >= needed) {
        this.tokens -= needed;
        return waitedMs;
      }

      const missing = needed - this.tokens;
      const waitMs = Math.ceil((missing / this.requestsPerSecond) * 1000);
      waitedMs += waitMs;
      await sleep(waitMs);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
