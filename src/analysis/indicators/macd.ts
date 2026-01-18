import { MACD } from 'technicalindicators';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('MACD');

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  crossover: 'BULLISH' | 'BEARISH' | null;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export class MACDIndicator {
  /**
   * Calculate MACD indicator
   * @param prices Array of closing prices
   * @param fastPeriod Fast EMA period (default: 12)
   * @param slowPeriod Slow EMA period (default: 26)
   * @param signalPeriod Signal line period (default: 9)
   */
  public static calculate(
    prices: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): MACDResult | null {
    const minLength = slowPeriod + signalPeriod;
    
    if (prices.length < minLength) {
      logger.warn(`Insufficient data for MACD. Need ${minLength}, got ${prices.length}`);
      return null;
    }

    try {
      const macdData = MACD.calculate({
        values: prices,
        fastPeriod,
        slowPeriod,
        signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });

      if (macdData.length < 2) {
        return null;
      }

      const current = macdData[macdData.length - 1];
      const previous = macdData[macdData.length - 2];

      if (!current || !previous) {
        return null;
      }

      // Detect crossover
      let crossover: 'BULLISH' | 'BEARISH' | null = null;
      
      // Bullish crossover: MACD crosses above signal line
      if (previous.MACD !== undefined && previous.signal !== undefined && current.MACD !== undefined && current.signal !== undefined) {
        if (previous.MACD <= previous.signal && current.MACD > current.signal) {
          crossover = 'BULLISH';
        }
        // Bearish crossover: MACD crosses below signal line
        else if (previous.MACD >= previous.signal && current.MACD < current.signal) {
          crossover = 'BEARISH';
        }
      }

      // Determine trend based on MACD position relative to signal and zero line
      let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      
      // Trend analysis
      if (current.MACD !== undefined && current.signal !== undefined) {
        if (current.MACD > current.signal && current.MACD > 0) {
          trend = 'BULLISH';
        } else if (current.MACD < current.signal && current.MACD < 0) {
          trend = 'BEARISH';
        } else {
          trend = 'NEUTRAL';
        }
      } else {
        trend = 'NEUTRAL';
      }

      return {
        macd: current.MACD !== undefined ? Math.round(current.MACD * 100) / 100 : 0,
        signal: current.signal !== undefined ? Math.round(current.signal * 100) / 100 : 0,
        histogram: current.histogram !== undefined ? Math.round(current.histogram * 100) / 100 : 0,
        crossover,
        trend
      };
    } catch (error) {
      logger.error('MACD calculation failed', { error });
      return null;
    }
  }

  /**
   * Get descriptive message for MACD signal
   */
  public static getSignalMessage(result: MACDResult): string {
    const { macd, signal, histogram, crossover, trend } = result;

    let message = `MACD: ${macd}\nSignal: ${signal}\nHistogram: ${histogram}\n\n`;

    if (crossover === 'BULLISH') {
      message += '🟢 BULLISH CROSSOVER - BUY SIGNAL\nMACD crossed above signal line';
    } else if (crossover === 'BEARISH') {
      message += '🔴 BEARISH CROSSOVER - SELL SIGNAL\nMACD crossed below signal line';
    } else {
      if (trend === 'BULLISH') {
        message += '📈 BULLISH TREND\nMACD above signal and zero line';
      } else if (trend === 'BEARISH') {
        message += '📉 BEARISH TREND\nMACD below signal and zero line';
      } else {
        message += '🟡 NEUTRAL\nNo clear signal';
      }
    }

    return message;
  }

  /**
   * Check for MACD divergence
   */
  public static detectDivergence(
    prices: number[],
    macdHistogram: number[],
    lookback: number = 5
  ): 'BULLISH' | 'BEARISH' | null {
    if (prices.length < lookback * 2 || macdHistogram.length < lookback * 2) {
      return null;
    }

    const recentPrices = prices.slice(-lookback);
    const recentHistogram = macdHistogram.slice(-lookback);

    // Bearish divergence: price higher highs, histogram lower highs
    const priceHigh = Math.max(...recentPrices);
    const histogramHigh = Math.max(...recentHistogram);
    
    if (priceHigh === recentPrices[recentPrices.length - 1]) {
      const prevPriceHigh = Math.max(...recentPrices.slice(0, -1));
      const prevHistHigh = Math.max(...recentHistogram.slice(0, -1));
      
      if (priceHigh > prevPriceHigh && histogramHigh < prevHistHigh) {
        return 'BEARISH';
      }
    }

    // Bullish divergence: price lower lows, histogram higher lows
    const priceLow = Math.min(...recentPrices);
    const histogramLow = Math.min(...recentHistogram);
    
    if (priceLow === recentPrices[recentPrices.length - 1]) {
      const prevPriceLow = Math.min(...recentPrices.slice(0, -1));
      const prevHistLow = Math.min(...recentHistogram.slice(0, -1));
      
      if (priceLow < prevPriceLow && histogramLow > prevHistLow) {
        return 'BULLISH';
      }
    }

    return null;
  }
}
