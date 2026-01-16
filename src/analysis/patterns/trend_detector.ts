import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('TrendDetector');

export interface TrendResult {
  direction: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  trendDuration: number; // Number of candles in trend
}

export class TrendDetector {
  /**
   * Detect trend using swing highs and lows
   * @param highs Array of high prices
   * @param lows Array of low prices
   * @param closes Array of closing prices
   * @param lookback Number of candles to analyze
   */
  public static detect(
    highs: number[],
    lows: number[],
    closes: number[],
    lookback: number = 20
  ): TrendResult | null {
    if (highs.length < lookback || lows.length < lookback || closes.length < lookback) {
      logger.warn(`Insufficient data for trend detection. Need ${lookback} candles`);
      return null;
    }

    try {
      const recentHighs = highs.slice(-lookback);
      const recentLows = lows.slice(-lookback);
      const recentCloses = closes.slice(-lookback);

      // Find swing highs and lows
      const swingHighs = this.findSwingPoints(recentHighs, true);
      const swingLows = this.findSwingPoints(recentLows, false);

      // Analyze if making higher highs and higher lows (uptrend)
      const higherHighs = this.isAscending(swingHighs);
      const higherLows = this.isAscending(swingLows);

      // Analyze if making lower highs and lower lows (downtrend)
      const lowerHighs = this.isDescending(swingHighs);
      const lowerLows = this.isDescending(swingLows);

      // Determine trend direction
      let direction: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
      let strength: 'STRONG' | 'MODERATE' | 'WEAK';

      if (higherHighs && higherLows) {
        direction = 'UPTREND';
        strength = swingHighs.length >= 3 && swingLows.length >= 3 ? 'STRONG' : 'MODERATE';
      } else if (lowerHighs && lowerLows) {
        direction = 'DOWNTREND';
        strength = swingHighs.length >= 3 && swingLows.length >= 3 ? 'STRONG' : 'MODERATE';
      } else if (higherLows && !lowerHighs) {
        direction = 'UPTREND';
        strength = 'WEAK';
      } else if (lowerHighs && !higherLows) {
        direction = 'DOWNTREND';
        strength = 'WEAK';
      } else {
        direction = 'SIDEWAYS';
        strength = 'WEAK';
      }

      // Calculate trend duration
      const trendDuration = this.calculateTrendDuration(recentCloses, direction);

      return {
        direction,
        strength,
        higherHighs,
        higherLows,
        lowerHighs,
        lowerLows,
        trendDuration
      };
    } catch (error) {
      logger.error('Trend detection failed', { error });
      return null;
    }
  }

  /**
   * Find swing high/low points
   */
  private static findSwingPoints(data: number[], isHigh: boolean): number[] {
    const swings: number[] = [];
    const window = 2; // Look 2 candles before and after

    for (let i = window; i < data.length - window; i++) {
      let isSwing = true;

      if (isHigh) {
        // Check if it's a swing high
        for (let j = i - window; j <= i + window; j++) {
          if (j !== i && data[j] >= data[i]) {
            isSwing = false;
            break;
          }
        }
      } else {
        // Check if it's a swing low
        for (let j = i - window; j <= i + window; j++) {
          if (j !== i && data[j] <= data[i]) {
            isSwing = false;
            break;
          }
        }
      }

      if (isSwing) {
        swings.push(data[i]);
      }
    }

    return swings;
  }

  /**
   * Check if array values are ascending (each higher than previous)
   */
  private static isAscending(values: number[]): boolean {
    if (values.length < 2) return false;

    for (let i = 1; i < values.length; i++) {
      if (values[i] <= values[i - 1]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if array values are descending (each lower than previous)
   */
  private static isDescending(values: number[]): boolean {
    if (values.length < 2) return false;

    for (let i = 1; i < values.length; i++) {
      if (values[i] >= values[i - 1]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate how many candles the trend has been in effect
   */
  private static calculateTrendDuration(closes: number[], direction: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS'): number {
    if (direction === 'SIDEWAYS') return closes.length;

    let duration = 0;

    if (direction === 'UPTREND') {
      // Count consecutive candles where price is generally rising
      for (let i = closes.length - 1; i > 0; i--) {
        const sma5 = closes.slice(Math.max(0, i - 5), i).reduce((a, b) => a + b, 0) / Math.min(5, i);
        const prevSma5 = closes.slice(Math.max(0, i - 6), i - 1).reduce((a, b) => a + b, 0) / Math.min(5, i - 1);

        if (sma5 > prevSma5) {
          duration++;
        } else {
          break;
        }
      }
    } else if (direction === 'DOWNTREND') {
      // Count consecutive candles where price is generally falling
      for (let i = closes.length - 1; i > 0; i--) {
        const sma5 = closes.slice(Math.max(0, i - 5), i).reduce((a, b) => a + b, 0) / Math.min(5, i);
        const prevSma5 = closes.slice(Math.max(0, i - 6), i - 1).reduce((a, b) => a + b, 0) / Math.min(5, i - 1);

        if (sma5 < prevSma5) {
          duration++;
        } else {
          break;
        }
      }
    }

    return duration;
  }

  /**
   * Get descriptive message for trend
   */
  public static getSignalMessage(result: TrendResult): string {
    const { direction, strength, higherHighs, higherLows, lowerHighs, lowerLows, trendDuration } = result;

    let message = `📈 Trend Analysis:\n\n`;

    switch (direction) {
      case 'UPTREND':
        message += `Direction: 📈 UPTREND (${strength})\n`;
        message += `Duration: ${trendDuration} candles\n\n`;
        if (higherHighs && higherLows) {
          message += '✅ Higher Highs ✅ Higher Lows\n';
          message += 'Classic uptrend pattern\n';
          message += 'Signal: BULLISH 🟢';
        } else {
          message += '⚠️ Weak uptrend signals\n';
          message += 'Signal: CAUTIOUSLY BULLISH 🟡';
        }
        break;

      case 'DOWNTREND':
        message += `Direction: 📉 DOWNTREND (${strength})\n`;
        message += `Duration: ${trendDuration} candles\n\n`;
        if (lowerHighs && lowerLows) {
          message += '❌ Lower Highs ❌ Lower Lows\n';
          message += 'Classic downtrend pattern\n';
          message += 'Signal: BEARISH 🔴';
        } else {
          message += '⚠️ Weak downtrend signals\n';
          message += 'Signal: CAUTIOUSLY BEARISH 🟠';
        }
        break;

      case 'SIDEWAYS':
        message += `Direction: ↔️ SIDEWAYS (${strength})\n`;
        message += `Duration: ${trendDuration} candles\n\n`;
        message += 'Mixed signals\n';
        message += 'Price consolidating\n';
        message += 'Signal: NEUTRAL 🟡';
        break;
    }

    return message;
  }
}
