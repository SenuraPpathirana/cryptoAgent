import { createModuleLogger } from '../config/logger';
import { RATE_LIMIT_WINDOW_MS, MAX_ALERTS_PER_WINDOW, ALERT_DEBOUNCE_MS } from '../config/constants';

const logger = createModuleLogger('RateLimiter');

interface RateLimitEntry {
  count: number;
  windowStart: number;
  lastAlert: number;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private limits: Map<string, RateLimitEntry>;

  private constructor() {
    this.limits = new Map();
    this.startCleanupTimer();
  }

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Check if an alert can be sent for a goal
   */
  public canSendAlert(goalId: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(goalId);

    // First alert for this goal
    if (!entry) {
      this.limits.set(goalId, {
        count: 1,
        windowStart: now,
        lastAlert: now,
      });
      return true;
    }

    // Check debounce (minimum time between alerts)
    const timeSinceLastAlert = now - entry.lastAlert;
    if (timeSinceLastAlert < ALERT_DEBOUNCE_MS) {
      logger.debug(`Alert debounced for goal ${goalId}`, {
        timeSinceLastMs: timeSinceLastAlert,
        requiredMs: ALERT_DEBOUNCE_MS,
      });
      return false;
    }

    // Check rate limit window
    const windowElapsed = now - entry.windowStart;
    
    if (windowElapsed >= RATE_LIMIT_WINDOW_MS) {
      // Window expired, reset
      this.limits.set(goalId, {
        count: 1,
        windowStart: now,
        lastAlert: now,
      });
      return true;
    }

    // Within window, check count
    if (entry.count >= MAX_ALERTS_PER_WINDOW) {
      logger.warn(`Rate limit exceeded for goal ${goalId}`, {
        count: entry.count,
        maxAlerts: MAX_ALERTS_PER_WINDOW,
        windowRemainingMs: RATE_LIMIT_WINDOW_MS - windowElapsed,
      });
      return false;
    }

    // Increment count and update last alert time
    entry.count++;
    entry.lastAlert = now;
    return true;
  }

  /**
   * Record an alert sent
   */
  public recordAlert(goalId: string): void {
    const now = Date.now();
    const entry = this.limits.get(goalId);

    if (entry) {
      entry.count++;
      entry.lastAlert = now;
    } else {
      this.limits.set(goalId, {
        count: 1,
        windowStart: now,
        lastAlert: now,
      });
    }

    logger.debug(`Alert recorded for goal ${goalId}`, {
      count: this.limits.get(goalId)?.count,
    });
  }

  /**
   * Get rate limit status for a goal
   */
  public getStatus(goalId: string): {
    count: number;
    remaining: number;
    resetIn: number;
  } {
    const entry = this.limits.get(goalId);
    
    if (!entry) {
      return {
        count: 0,
        remaining: MAX_ALERTS_PER_WINDOW,
        resetIn: RATE_LIMIT_WINDOW_MS,
      };
    }

    const now = Date.now();
    const windowElapsed = now - entry.windowStart;
    const resetIn = Math.max(0, RATE_LIMIT_WINDOW_MS - windowElapsed);

    return {
      count: entry.count,
      remaining: Math.max(0, MAX_ALERTS_PER_WINDOW - entry.count),
      resetIn,
    };
  }

  /**
   * Reset rate limit for a goal
   */
  public reset(goalId: string): void {
    this.limits.delete(goalId);
    logger.debug(`Rate limit reset for goal ${goalId}`);
  }

  /**
   * Clear all rate limits
   */
  public clearAll(): void {
    this.limits.clear();
    logger.info('All rate limits cleared');
  }

  /**
   * Clean up expired entries periodically
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [goalId, entry] of this.limits.entries()) {
        const windowElapsed = now - entry.windowStart;
        if (windowElapsed >= RATE_LIMIT_WINDOW_MS * 2) {
          this.limits.delete(goalId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
      }
    }, RATE_LIMIT_WINDOW_MS);
  }
}
