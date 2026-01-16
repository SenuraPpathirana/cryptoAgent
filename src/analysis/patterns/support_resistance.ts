import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('SupportResistance');

export interface Level {
  price: number;
  strength: number; // 0-100, how strong is this level
  touches: number;  // How many times price closed at this level
  type: 'SUPPORT' | 'RESISTANCE';
  bodyCloses: number; // Number of candle body closes at this level
}

export interface SupportResistanceResult {
  support: Level[];
  resistance: Level[];
  nearestSupport: Level | null;
  nearestResistance: Level | null;
  position: 'NEAR_RESISTANCE' | 'NEAR_SUPPORT' | 'BETWEEN' | 'BREAKOUT_ABOVE' | 'BREAKDOWN_BELOW';
  trendBroken?: boolean; // If a candle closed by breaking a wick
}

export class SupportResistanceDetector {
  /**
   * Detect support and resistance levels based on candle body closes
   * Support/Resistance are where candle BODIES close, not wicks
   * - For shorter timeframes (1h, 15m): Most candles should close there
   * - For longer timeframes (1d, 1w): Even one candle body close is significant
   * @param highs Array of high prices
   * @param lows Array of low prices
   * @param closes Array of closing prices
   * @param opens Array of opening prices
   * @param lookback Number of candles to analyze
   * @param tolerance Price tolerance percentage for grouping levels
   * @param timeframe Timeframe for determining significance (1m, 5m, 15m, 1h, 4h, 1d, 1w)
   */
  public static detect(
    highs: number[],
    lows: number[],
    closes: number[],
    opens?: number[],
    lookback: number = 50,
    tolerance: number = 0.5,
    timeframe: string = '1h'
  ): SupportResistanceResult | null {
    if (highs.length < lookback || lows.length < lookback || closes.length < lookback) {
      logger.warn(`Insufficient data for S/R detection. Need ${lookback} candles`);
      return null;
    }

    try {
      const recentHighs = highs.slice(-lookback);
      const recentLows = lows.slice(-lookback);
      const recentCloses = closes.slice(-lookback);
      const recentOpens = opens ? opens.slice(-lookback) : recentCloses;
      const currentPrice = closes[closes.length - 1];

      // Determine minimum touches based on timeframe
      const isLongTimeframe = ['1d', '1D', '1w', '1W'].includes(timeframe);
      const minTouches = isLongTimeframe ? 1 : 2; // Long timeframes: 1 close is enough

      // Find resistance levels (where bodies closed near highs - rejections)
      const resistanceLevels = this.findLevelsFromBodyCloses(
        recentHighs,
        recentLows,
        recentCloses,
        recentOpens,
        currentPrice,
        'RESISTANCE',
        tolerance,
        minTouches
      );

      // Find support levels (where bodies closed near lows - bounces)
      const supportLevels = this.findLevelsFromBodyCloses(
        recentHighs,
        recentLows,
        recentCloses,
        recentOpens,
        currentPrice,
        'SUPPORT',
        tolerance,
        minTouches
      );

      // Find nearest levels
      const nearestResistance = resistanceLevels.length > 0 ? resistanceLevels[0] : null;
      const nearestSupport = supportLevels.length > 0 ? supportLevels[supportLevels.length - 1] : null;

      // Check if trend is broken (candle closed by breaking a wick)
      const trendBroken = this.checkTrendBreak(recentHighs, recentLows, recentCloses, recentOpens);

      // Determine price position
      let position: 'NEAR_RESISTANCE' | 'NEAR_SUPPORT' | 'BETWEEN' | 'BREAKOUT_ABOVE' | 'BREAKDOWN_BELOW';

      if (nearestResistance && Math.abs(currentPrice - nearestResistance.price) / currentPrice < 0.01) {
        position = 'NEAR_RESISTANCE';
      } else if (nearestSupport && Math.abs(currentPrice - nearestSupport.price) / currentPrice < 0.01) {
        position = 'NEAR_SUPPORT';
      } else if (nearestResistance && resistanceLevels.length > 0 && currentPrice > nearestResistance.price) {
        position = 'BREAKOUT_ABOVE';
      } else if (nearestSupport && supportLevels.length > 0 && currentPrice < nearestSupport.price) {
        position = 'BREAKDOWN_BELOW';
      } else {
        position = 'BETWEEN';
      }

      return {
        support: supportLevels,
        resistance: resistanceLevels,
        nearestSupport,
        nearestResistance,
        position,
        trendBroken
      };
    } catch (error) {
      logger.error('S/R detection failed', { error });
      return null;
    }
  }

  /**
   * Find significant price levels based on candle body closes
   * Focus on where bodies close, not wicks
   */
  private static findLevelsFromBodyCloses(
    highs: number[],
    lows: number[],
    closes: number[],
    opens: number[],
    currentPrice: number,
    type: 'SUPPORT' | 'RESISTANCE',
    tolerance: number,
    minTouches: number
  ): Level[] {
    const levels: Map<number, { touches: number; prices: number[]; bodyCloses: number }> = new Map();

    // Analyze each candle
    for (let i = 0; i < closes.length; i++) {
      const close = closes[i];
      const open = opens[i];
      const high = highs[i];
      const low = lows[i];
      
      // Determine candle body (min and max of open/close)
      const bodyTop = Math.max(open, close);
      const bodyBottom = Math.min(open, close);
      
      // For resistance: look at where bodies closed near the top (rejections)
      // For support: look at where bodies closed near the bottom (bounces)
      let priceLevel: number;
      
      if (type === 'RESISTANCE') {
        // Resistance: candles that closed near their highs but got rejected
        // If close is near high, it's a resistance test
        const upperWick = high - bodyTop;
        const bodySize = bodyTop - bodyBottom;
        
        // Consider it a resistance if upper wick exists or body closed near high
        if (upperWick > bodySize * 0.1 || close === high) {
          priceLevel = bodyTop; // Use body top as resistance level
        } else {
          continue;
        }
      } else {
        // Support: candles that closed near their lows but bounced
        const lowerWick = bodyBottom - low;
        const bodySize = bodyTop - bodyBottom;
        
        // Consider it a support if lower wick exists or body closed near low
        if (lowerWick > bodySize * 0.1 || close === low) {
          priceLevel = bodyBottom; // Use body bottom as support level
        } else {
          continue;
        }
      }

      // Group similar price levels
      let foundGroup = false;
      for (const [key, value] of levels.entries()) {
        if (Math.abs(priceLevel - key) / key < tolerance / 100) {
          value.touches++;
          value.prices.push(priceLevel);
          value.bodyCloses++;
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        levels.set(priceLevel, { touches: 1, prices: [priceLevel], bodyCloses: 1 });
      }
    }

    // Convert to Level array and calculate strength
    const levelArray: Level[] = [];

    for (const [, value] of levels.entries()) {
      if (value.touches >= minTouches) {
        const avgPrice = value.prices.reduce((a, b) => a + b, 0) / value.prices.length;
        
        // Filter based on type and current price
        const isValid = type === 'RESISTANCE' 
          ? avgPrice > currentPrice 
          : avgPrice < currentPrice;

        if (isValid) {
          // Strength based on number of body closes
          const strength = Math.min(100, value.bodyCloses * 25);
          levelArray.push({
            price: Math.round(avgPrice * 100) / 100,
            strength,
            touches: value.touches,
            bodyCloses: value.bodyCloses,
            type
          });
        }
      }
    }

    // Sort: resistance ascending (nearest first), support descending (nearest first)
    levelArray.sort((a, b) => 
      type === 'RESISTANCE' ? a.price - b.price : b.price - a.price
    );

    // Return top 3 levels
    return levelArray.slice(0, 3);
  }

  /**
   * Check if trend is broken (candle closed by breaking a wick of previous candles)
   */
  private static checkTrendBreak(
    highs: number[],
    lows: number[],
    closes: number[],
    opens: number[]
  ): boolean {
    if (closes.length < 3) return false;

    const lastCandle = {
      close: closes[closes.length - 1],
      open: opens[opens.length - 1],
      high: highs[highs.length - 1],
      low: lows[lows.length - 1]
    };

    // Check last 5 candles for wick breaks
    const lookback = Math.min(5, closes.length - 1);
    
    for (let i = 1; i <= lookback; i++) {
      const prevIdx = closes.length - 1 - i;
      const prevHigh = highs[prevIdx];
      const prevLow = lows[prevIdx];
      const prevBodyTop = Math.max(opens[prevIdx], closes[prevIdx]);
      const prevBodyBottom = Math.min(opens[prevIdx], closes[prevIdx]);
      
      // Upper wick of previous candle
      const prevUpperWick = prevHigh - prevBodyTop;
      // Lower wick of previous candle
      const prevLowerWick = prevBodyBottom - prevLow;
      
      // Check if current candle closed above previous upper wick
      if (prevUpperWick > 0 && lastCandle.close > prevHigh) {
        return true; // Broke above resistance wick
      }
      
      // Check if current candle closed below previous lower wick
      if (prevLowerWick > 0 && lastCandle.close < prevLow) {
        return true; // Broke below support wick
      }
    }

    return false;
  }

  /**
   * Get descriptive message for S/R levels
   */
  public static getSignalMessage(result: SupportResistanceResult, currentPrice: number): string {
    const { support, resistance, nearestSupport, nearestResistance, position } = result;

    let message = `📊 Support & Resistance (Body Close Levels):\n\n`;
    message += `Current Price: $${currentPrice.toLocaleString()}\n\n`;

    // Nearest Resistance
    if (nearestResistance) {
      const distance = ((nearestResistance.price - currentPrice) / currentPrice * 100).toFixed(2);
      message += `🔴 Nearest Resistance: $${nearestResistance.price.toLocaleString()}\n`;
      message += `   Distance: +${distance}%\n`;
      message += `   Strength: ${nearestResistance.strength}/100\n`;
      message += `   Body Closes: ${nearestResistance.bodyCloses}\n\n`;
    }

    // Nearest Support
    if (nearestSupport) {
      const distance = ((currentPrice - nearestSupport.price) / currentPrice * 100).toFixed(2);
      message += `🟢 Nearest Support: $${nearestSupport.price.toLocaleString()}\n`;
      message += `   Distance: -${distance}%\n`;
      message += `   Strength: ${nearestSupport.strength}/100\n`;
      message += `   Body Closes: ${nearestSupport.bodyCloses}\n\n`;
    }

    // Additional levels
    if (resistance.length > 1) {
      message += `Other Resistance Levels:\n`;
      resistance.slice(1).forEach((level, i) => {
        message += `   ${i + 2}. $${level.price.toLocaleString()} (${level.bodyCloses} body closes)\n`;
      });
      message += '\n';
    }

    if (support.length > 1) {
      message += `Other Support Levels:\n`;
      support.slice(1).forEach((level, i) => {
        message += `   ${i + 2}. $${level.price.toLocaleString()} (${level.bodyCloses} body closes)\n`;
      });
      message += '\n';
    }

    // Position analysis
    switch (position) {
      case 'NEAR_RESISTANCE':
        message += '⚠️ Price NEAR RESISTANCE (body close level)\nWatch for rejection or breakout';
        break;
      case 'NEAR_SUPPORT':
        message += '⚠️ Price NEAR SUPPORT (body close level)\nWatch for bounce or breakdown';
        break;
      case 'BREAKOUT_ABOVE':
        message += '🚀 BREAKOUT above resistance\nBody closed above - bullish if holds';
        break;
      case 'BREAKDOWN_BELOW':
        message += '📉 BREAKDOWN below support\nBody closed below - bearish if holds';
        break;
      case 'BETWEEN':
        message += '🟡 Price between S/R levels\nRoom to move in either direction';
        break;
    }

    return message;
  }
}
