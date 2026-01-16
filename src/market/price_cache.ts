import { createModuleLogger } from '../config/logger';
import { PriceData } from '../types/market.types';
import EventEmitter from 'events';

const logger = createModuleLogger('PriceCache');

export class PriceCache extends EventEmitter {
  private static instance: PriceCache;
  private prices: Map<string, PriceData>;
  private priceHistory: Map<string, PriceData[]>;
  private maxHistoryLength = 100;

  private constructor() {
    super();
    this.prices = new Map();
    this.priceHistory = new Map();
  }

  public static getInstance(): PriceCache {
    if (!PriceCache.instance) {
      PriceCache.instance = new PriceCache();
    }
    return PriceCache.instance;
  }

  public updatePrice(symbol: string, priceData: PriceData): void {
    const previous = this.prices.get(symbol);
    this.prices.set(symbol, priceData);

    // Update history
    const history = this.priceHistory.get(symbol) || [];
    history.push(priceData);

    // Keep only recent history
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }
    this.priceHistory.set(symbol, history);

    // Emit price update event
    this.emit('price-update', {
      symbol,
      previous,
      current: priceData,
    });

    logger.debug(`Price updated: ${symbol}`, {
      bid: priceData.bid,
      ask: priceData.ask,
      last: priceData.last,
    });
  }

  public getPrice(symbol: string): PriceData | undefined {
    return this.prices.get(symbol);
  }

  public getPrices(symbols: string[]): Map<string, PriceData> {
    const result = new Map<string, PriceData>();
    
    symbols.forEach(symbol => {
      const price = this.prices.get(symbol);
      if (price) {
        result.set(symbol, price);
      }
    });

    return result;
  }

  public getAllPrices(): Map<string, PriceData> {
    return new Map(this.prices);
  }

  public getPriceHistory(symbol: string, limit?: number): PriceData[] {
    const history = this.priceHistory.get(symbol) || [];
    
    if (limit && limit < history.length) {
      return history.slice(-limit);
    }

    return history;
  }

  public hasPrice(symbol: string): boolean {
    return this.prices.has(symbol);
  }

  public getSymbols(): string[] {
    return Array.from(this.prices.keys());
  }

  public clear(): void {
    this.prices.clear();
    this.priceHistory.clear();
    logger.info('Price cache cleared');
  }

  public getStats(): {
    symbols: number;
    totalUpdates: number;
    oldestUpdate: number;
    newestUpdate: number;
  } {
    const prices = Array.from(this.prices.values());
    const timestamps = prices.map(p => p.timestamp);

    return {
      symbols: this.prices.size,
      totalUpdates: prices.length,
      oldestUpdate: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestUpdate: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    };
  }

  /**
   * Calculate price change over a time period
   */
  public getPriceChange(symbol: string, periodMs: number): {
    change: number;
    changePercent: number;
  } | null {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length < 2) {
      return null;
    }

    const now = Date.now();
    const targetTime = now - periodMs;

    // Find price closest to target time
    let oldPrice: PriceData | null = null;
    for (const price of history) {
      if (price.timestamp <= targetTime) {
        oldPrice = price;
      } else {
        break;
      }
    }

    if (!oldPrice) {
      oldPrice = history[0];
    }

    const currentPrice = this.prices.get(symbol);
    if (!currentPrice) {
      return null;
    }

    const change = currentPrice.last - oldPrice.last;
    const changePercent = (change / oldPrice.last) * 100;

    return { change, changePercent };
  }
}
