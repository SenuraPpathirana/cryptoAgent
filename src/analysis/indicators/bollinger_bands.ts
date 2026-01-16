import { BollingerBands } from 'technicalindicators';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('BollingerBands');

export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  currentPrice: number;
  position: 'ABOVE_UPPER' | 'NEAR_UPPER' | 'MIDDLE' | 'NEAR_LOWER' | 'BELOW_LOWER';
  bandwidth: number;
  squeeze: boolean;
}

export class BollingerBandsIndicator {
  /**
   * Calculate Bollinger Bands
   * @param prices Array of closing prices
   * @param period Period (default: 20)
   * @param stdDev Standard deviation multiplier (default: 2)
   */
  public static calculate(
    prices: number[],
    period: number = 20,
    stdDev: number = 2
  ): BollingerBandsResult | null {
    if (prices.length < period) {
      logger.warn(`Insufficient data for Bollinger Bands. Need ${period}, got ${prices.length}`);
      return null;
    }

    try {
      const bbData = BollingerBands.calculate({
        period,
        values: prices,
        stdDev
      });

      if (bbData.length === 0) {
        return null;
      }

      const current = bbData[bbData.length - 1];
      const currentPrice = prices[prices.length - 1];

      // Calculate bandwidth (volatility measure)
      const bandwidth = ((current.upper - current.lower) / current.middle) * 100;

      // Determine if in squeeze (low volatility)
      const squeeze = bandwidth < 10; // Bandwidth below 10% indicates squeeze

      // Determine price position relative to bands
      let position: 'ABOVE_UPPER' | 'NEAR_UPPER' | 'MIDDLE' | 'NEAR_LOWER' | 'BELOW_LOWER';

      const upperThreshold = current.middle + ((current.upper - current.middle) * 0.8);
      const lowerThreshold = current.middle - ((current.middle - current.lower) * 0.8);

      if (currentPrice > current.upper) {
        position = 'ABOVE_UPPER';
      } else if (currentPrice >= upperThreshold) {
        position = 'NEAR_UPPER';
      } else if (currentPrice < current.lower) {
        position = 'BELOW_LOWER';
      } else if (currentPrice <= lowerThreshold) {
        position = 'NEAR_LOWER';
      } else {
        position = 'MIDDLE';
      }

      return {
        upper: Math.round(current.upper * 100) / 100,
        middle: Math.round(current.middle * 100) / 100,
        lower: Math.round(current.lower * 100) / 100,
        currentPrice: Math.round(currentPrice * 100) / 100,
        position,
        bandwidth: Math.round(bandwidth * 100) / 100,
        squeeze
      };
    } catch (error) {
      logger.error('Bollinger Bands calculation failed', { error });
      return null;
    }
  }

  /**
   * Get descriptive message for Bollinger Bands
   */
  public static getSignalMessage(result: BollingerBandsResult): string {
    const { upper, middle, lower, currentPrice, position, bandwidth, squeeze } = result;

    let message = `📊 Bollinger Bands:\n\n`;
    message += `Upper: $${upper.toLocaleString()}\n`;
    message += `Middle: $${middle.toLocaleString()}\n`;
    message += `Lower: $${lower.toLocaleString()}\n`;
    message += `Price: $${currentPrice.toLocaleString()}\n`;
    message += `Bandwidth: ${bandwidth}%\n\n`;

    if (squeeze) {
      message += '⚠️ SQUEEZE DETECTED\nLow volatility - expect breakout soon\n\n';
    }

    switch (position) {
      case 'ABOVE_UPPER':
        message += '🔴 OVERBOUGHT\nPrice above upper band\nPotential reversal or continued strength';
        break;
      case 'NEAR_UPPER':
        message += '🟠 APPROACHING OVERBOUGHT\nPrice near upper band\nWatch for reversal';
        break;
      case 'BELOW_LOWER':
        message += '🟢 OVERSOLD\nPrice below lower band\nPotential bounce or continued weakness';
        break;
      case 'NEAR_LOWER':
        message += '🟡 APPROACHING OVERSOLD\nPrice near lower band\nWatch for bounce';
        break;
      case 'MIDDLE':
        message += '🟡 NEUTRAL\nPrice in middle of bands\nNo clear signal';
        break;
    }

    return message;
  }
}
