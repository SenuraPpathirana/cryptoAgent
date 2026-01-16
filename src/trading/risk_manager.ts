import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';

const logger = createModuleLogger('RiskManager');

export class RiskManager {
  private static instance: RiskManager;
  private dailyTradeCount = 0;
  private openPositions = 0;
  private lastTradeTimestamps: number[] = [];

  private constructor() {
    // Reset daily counter at midnight
    this.scheduleReset();
  }

  public static getInstance(): RiskManager {
    if (!RiskManager.instance) {
      RiskManager.instance = new RiskManager();
    }
    return RiskManager.instance;
  }

  public canOpenPosition(): { allowed: boolean; reason?: string } {
    // Check max open positions
    if (this.openPositions >= env.MAX_OPEN_POSITIONS) {
      return {
        allowed: false,
        reason: `Max open positions reached (${env.MAX_OPEN_POSITIONS})`,
      };
    }

    // Check daily trade limit
    if (this.dailyTradeCount >= env.MAX_DAILY_TRADES) {
      return {
        allowed: false,
        reason: `Daily trade limit reached (${env.MAX_DAILY_TRADES})`,
      };
    }

    // Check cooldown
    const cooldownMs = env.COOLDOWN_MINUTES * 60 * 1000;
    const now = Date.now();
    const recentTrades = this.lastTradeTimestamps.filter(t => now - t < cooldownMs);
    
    if (recentTrades.length > 0) {
      const timeSinceLastTrade = now - Math.max(...recentTrades);
      if (timeSinceLastTrade < cooldownMs) {
        return {
          allowed: false,
          reason: `Cooldown active (${Math.ceil((cooldownMs - timeSinceLastTrade) / 60000)}m remaining)`,
        };
      }
    }

    return { allowed: true };
  }

  public recordTrade(): void {
    this.dailyTradeCount++;
    this.openPositions++;
    this.lastTradeTimestamps.push(Date.now());
    
    // Keep only recent timestamps
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    this.lastTradeTimestamps = this.lastTradeTimestamps.filter(t => t > cutoff);
    
    logger.info('Trade recorded', {
      dailyCount: this.dailyTradeCount,
      openPositions: this.openPositions,
    });
  }

  public closePosition(): void {
    this.openPositions = Math.max(0, this.openPositions - 1);
    logger.info('Position closed', { openPositions: this.openPositions });
  }

  public getStats(): {
    dailyTradeCount: number;
    openPositions: number;
    maxDaily: number;
    maxOpen: number;
  } {
    return {
      dailyTradeCount: this.dailyTradeCount,
      openPositions: this.openPositions,
      maxDaily: env.MAX_DAILY_TRADES,
      maxOpen: env.MAX_OPEN_POSITIONS,
    };
  }

  private scheduleReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.dailyTradeCount = 0;
      logger.info('Daily trade count reset');
      this.scheduleReset();
    }, msUntilMidnight);
  }
}
