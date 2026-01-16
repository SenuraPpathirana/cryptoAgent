import { SMA, EMA } from 'technicalindicators';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('MovingAverages');

export interface MAResult {
  sma20: number;
  sma50: number;
  sma200: number;
  ema9: number;
  ema21: number;
  trend: 'STRONG_UPTREND' | 'UPTREND' | 'NEUTRAL' | 'DOWNTREND' | 'STRONG_DOWNTREND';
  goldenCross: boolean;
  deathCross: boolean;
}

export class MovingAverageIndicator {
  /**
   * Calculate multiple moving averages
   */
  public static calculate(prices: number[]): MAResult | null {
    if (prices.length < 200) {
      logger.warn(`Insufficient data for complete MA analysis. Need 200, got ${prices.length}`);
      
      // Calculate what we can with available data
      return this.calculatePartial(prices);
    }

    try {
      const currentPrice = prices[prices.length - 1];

      const sma20Values = SMA.calculate({ period: 20, values: prices });
      const sma50Values = SMA.calculate({ period: 50, values: prices });
      const sma200Values = SMA.calculate({ period: 200, values: prices });
      const ema9Values = EMA.calculate({ period: 9, values: prices });
      const ema21Values = EMA.calculate({ period: 21, values: prices });

      const sma20 = sma20Values[sma20Values.length - 1];
      const sma50 = sma50Values[sma50Values.length - 1];
      const sma200 = sma200Values[sma200Values.length - 1];
      const ema9 = ema9Values[ema9Values.length - 1];
      const ema21 = ema21Values[ema21Values.length - 1];

      // Check for previous values for cross detection
      const prevSma50 = sma50Values.length > 1 ? sma50Values[sma50Values.length - 2] : sma50;
      const prevSma200 = sma200Values.length > 1 ? sma200Values[sma200Values.length - 2] : sma200;

      // Golden Cross: 50-day MA crosses above 200-day MA (bullish)
      const goldenCross = prevSma50 <= prevSma200 && sma50 > sma200;

      // Death Cross: 50-day MA crosses below 200-day MA (bearish)
      const deathCross = prevSma50 >= prevSma200 && sma50 < sma200;

      // Determine trend
      let trend: 'STRONG_UPTREND' | 'UPTREND' | 'NEUTRAL' | 'DOWNTREND' | 'STRONG_DOWNTREND';

      if (currentPrice > ema9 && ema9 > ema21 && ema21 > sma50 && sma50 > sma200) {
        trend = 'STRONG_UPTREND';
      } else if (currentPrice > ema9 && ema9 > ema21 && ema21 > sma50) {
        trend = 'UPTREND';
      } else if (currentPrice < ema9 && ema9 < ema21 && ema21 < sma50 && sma50 < sma200) {
        trend = 'STRONG_DOWNTREND';
      } else if (currentPrice < ema9 && ema9 < ema21 && ema21 < sma50) {
        trend = 'DOWNTREND';
      } else {
        trend = 'NEUTRAL';
      }

      return {
        sma20: Math.round(sma20 * 100) / 100,
        sma50: Math.round(sma50 * 100) / 100,
        sma200: Math.round(sma200 * 100) / 100,
        ema9: Math.round(ema9 * 100) / 100,
        ema21: Math.round(ema21 * 100) / 100,
        trend,
        goldenCross,
        deathCross
      };
    } catch (error) {
      logger.error('MA calculation failed', { error });
      return null;
    }
  }

  /**
   * Calculate partial MAs when not enough data available
   */
  private static calculatePartial(prices: number[]): MAResult | null {
    try {
      const currentPrice = prices[prices.length - 1];
      const result: any = {
        trend: 'NEUTRAL',
        goldenCross: false,
        deathCross: false
      };

      if (prices.length >= 20) {
        const sma20Values = SMA.calculate({ period: 20, values: prices });
        result.sma20 = Math.round(sma20Values[sma20Values.length - 1] * 100) / 100;
      }

      if (prices.length >= 50) {
        const sma50Values = SMA.calculate({ period: 50, values: prices });
        result.sma50 = Math.round(sma50Values[sma50Values.length - 1] * 100) / 100;
      }

      if (prices.length >= 200) {
        const sma200Values = SMA.calculate({ period: 200, values: prices });
        result.sma200 = Math.round(sma200Values[sma200Values.length - 1] * 100) / 100;
      }

      if (prices.length >= 9) {
        const ema9Values = EMA.calculate({ period: 9, values: prices });
        result.ema9 = Math.round(ema9Values[ema9Values.length - 1] * 100) / 100;
      }

      if (prices.length >= 21) {
        const ema21Values = EMA.calculate({ period: 21, values: prices });
        result.ema21 = Math.round(ema21Values[ema21Values.length - 1] * 100) / 100;
      }

      // Simple trend based on available MAs
      if (result.ema9 && result.ema21) {
        if (currentPrice > result.ema9 && result.ema9 > result.ema21) {
          result.trend = 'UPTREND';
        } else if (currentPrice < result.ema9 && result.ema9 < result.ema21) {
          result.trend = 'DOWNTREND';
        }
      }

      return result as MAResult;
    } catch (error) {
      logger.error('Partial MA calculation failed', { error });
      return null;
    }
  }

  /**
   * Get descriptive message for MA trend
   */
  public static getSignalMessage(result: MAResult): string {
    let message = '📊 Moving Averages:\n\n';

    if (result.ema9) message += `EMA(9): $${result.ema9.toLocaleString()}\n`;
    if (result.ema21) message += `EMA(21): $${result.ema21.toLocaleString()}\n`;
    if (result.sma20) message += `SMA(20): $${result.sma20.toLocaleString()}\n`;
    if (result.sma50) message += `SMA(50): $${result.sma50.toLocaleString()}\n`;
    if (result.sma200) message += `SMA(200): $${result.sma200.toLocaleString()}\n\n`;

    if (result.goldenCross) {
      message += '🌟 GOLDEN CROSS DETECTED!\n50-day MA crossed above 200-day MA\nStrong bullish signal\n\n';
    } else if (result.deathCross) {
      message += '💀 DEATH CROSS DETECTED!\n50-day MA crossed below 200-day MA\nStrong bearish signal\n\n';
    }

    switch (result.trend) {
      case 'STRONG_UPTREND':
        message += '📈 STRONG UPTREND\nAll MAs aligned bullishly';
        break;
      case 'UPTREND':
        message += '📈 UPTREND\nPrice above short-term MAs';
        break;
      case 'STRONG_DOWNTREND':
        message += '📉 STRONG DOWNTREND\nAll MAs aligned bearishly';
        break;
      case 'DOWNTREND':
        message += '📉 DOWNTREND\nPrice below short-term MAs';
        break;
      case 'NEUTRAL':
        message += '🟡 NEUTRAL\nMixed signals from MAs';
        break;
    }

    return message;
  }
}
