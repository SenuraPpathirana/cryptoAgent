import { logger } from '../config/logger.js';

type RateWindow = {
  count: number;
  windowStart: number;
  lastNotified: number;
};

export class RateLimiter {
  private windows = new Map<string, RateWindow>();
  private maxPerHour: number;
  private minDelayMs: number;

  constructor(maxPerHour = 20, minDelaySeconds = 5) {
    this.maxPerHour = maxPerHour;
    this.minDelayMs = minDelaySeconds * 1000;
  }

  canNotify(goalId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const window = this.windows.get(goalId);

    if (!window) {
      this.windows.set(goalId, {
        count: 1,
        windowStart: now,
        lastNotified: now
      });
      return { allowed: true };
    }

    // Check minimum delay (debounce)
    const timeSinceLast = now - window.lastNotified;
    if (timeSinceLast < this.minDelayMs) {
      return {
        allowed: false,
        reason: `Debounce active (${Math.ceil((this.minDelayMs - timeSinceLast) / 1000)}s remaining)`
      };
    }

    // Check hourly rate limit
    const windowElapsed = now - window.windowStart;
    const oneHour = 60 * 60 * 1000;

    if (windowElapsed >= oneHour) {
      // Reset window
      window.count = 1;
      window.windowStart = now;
      window.lastNotified = now;
      return { allowed: true };
    }

    if (window.count >= this.maxPerHour) {
      const resetIn = Math.ceil((oneHour - windowElapsed) / 1000 / 60);
      return {
        allowed: false,
        reason: `Rate limit exceeded (${window.count}/${this.maxPerHour}). Resets in ${resetIn}m`
      };
    }

    window.count++;
    window.lastNotified = now;
    return { allowed: true };
  }

  recordNotification(goalId: string): void {
    const window = this.windows.get(goalId);
    if (window) {
      window.count++;
      window.lastNotified = Date.now();
    }
  }

  getStats(goalId: string): { count: number; remaining: number; resetIn: number } | null {
    const window = this.windows.get(goalId);
    if (!window) {
      return { count: 0, remaining: this.maxPerHour, resetIn: 3600 };
    }

    const now = Date.now();
    const windowElapsed = now - window.windowStart;
    const oneHour = 60 * 60 * 1000;
    const resetIn = Math.ceil((oneHour - windowElapsed) / 1000);

    return {
      count: window.count,
      remaining: Math.max(0, this.maxPerHour - window.count),
      resetIn
    };
  }

  reset(goalId: string): void {
    this.windows.delete(goalId);
    logger.info('Rate limit reset', { goalId });
  }

  // Cleanup old entries periodically
  cleanup(): void {
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [goalId, window] of this.windows.entries()) {
      if (now - window.windowStart > twoHours) {
        this.windows.delete(goalId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Rate limiter cleanup', { entriesRemoved: cleaned });
    }
  }
}
