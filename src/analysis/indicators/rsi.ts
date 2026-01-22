import { RSI } from 'technicalindicators';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('RSI');

export interface RSIResult {
  value: number;
  signal: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL';
  strength: 'EXTREME' | 'STRONG' | 'MODERATE' | 'WEAK';
}

export interface DivergenceResult {
  type: 'BULLISH' | 'BEARISH';
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  priceChange: number;
  rsiChange: number;
  description: string;
}

export class RSIIndicator {
  /**
   * Calculate RSI and interpret the signal
   * @param prices Array of closing prices (most recent last)
   * @param period RSI period (default: 14)
   */
  public static calculate(prices: number[], period: number = 14): RSIResult | null {
    if (prices.length < period + 1) {
      logger.debug(`Insufficient data for RSI calculation. Need ${period + 1}, got ${prices.length}`);
      return null;
    }

    try {
      const rsiValues = RSI.calculate({
        values: prices,
        period: period
      });

      if (rsiValues.length === 0) {
        return null;
      }

      const currentRSI = rsiValues[rsiValues.length - 1];

      // Interpret RSI signal
      let signal: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL';
      let strength: 'EXTREME' | 'STRONG' | 'MODERATE' | 'WEAK';

      if (currentRSI <= 30) {
        signal = 'OVERSOLD';
        if (currentRSI <= 20) strength = 'EXTREME';
        else if (currentRSI <= 25) strength = 'STRONG';
        else strength = 'MODERATE';
      } else if (currentRSI >= 70) {
        signal = 'OVERBOUGHT';
        if (currentRSI >= 80) strength = 'EXTREME';
        else if (currentRSI >= 75) strength = 'STRONG';
        else strength = 'MODERATE';
      } else {
        signal = 'NEUTRAL';
        if (currentRSI >= 55 && currentRSI <= 65) strength = 'WEAK';
        else strength = 'MODERATE';
      }

      return {
        value: Math.round(currentRSI * 100) / 100,
        signal,
        strength
      };
    } catch (error) {
      logger.error('RSI calculation failed', { error });
      return null;
    }
  }

  /**
   * Check for RSI divergence with improved logic
   * Bearish: Latest top higher/lower than previous top, RSI shows opposite
   * Bullish: Latest bottom higher/lower than previous bottom, RSI shows opposite
   */
  public static detectDivergence(
    prices: number[],
    rsiValues: number[],
    lookback: number = 10
  ): DivergenceResult | null {
    if (prices.length < 30 || rsiValues.length < 30) {
      return null;
    }

    // Find tops (peaks) and bottoms (valleys) in recent data
    const recentWindow = Math.min(lookback * 3, prices.length);
    const recentPrices = prices.slice(-recentWindow);
    const recentRSI = rsiValues.slice(-recentWindow);

    // Find local peaks (tops)
    const tops: Array<{ index: number; price: number; rsi: number }> = [];
    for (let i = 2; i < recentPrices.length - 2; i++) {
      if (recentPrices[i] > recentPrices[i - 1] && 
          recentPrices[i] > recentPrices[i - 2] &&
          recentPrices[i] > recentPrices[i + 1] && 
          recentPrices[i] > recentPrices[i + 2]) {
        tops.push({ index: i, price: recentPrices[i], rsi: recentRSI[i] });
      }
    }

    // Find local troughs (bottoms)
    const bottoms: Array<{ index: number; price: number; rsi: number }> = [];
    for (let i = 2; i < recentPrices.length - 2; i++) {
      if (recentPrices[i] < recentPrices[i - 1] && 
          recentPrices[i] < recentPrices[i - 2] &&
          recentPrices[i] < recentPrices[i + 1] && 
          recentPrices[i] < recentPrices[i + 2]) {
        bottoms.push({ index: i, price: recentPrices[i], rsi: recentRSI[i] });
      }
    }

    // Check for BEARISH divergence (check latest 2 tops)
    if (tops.length >= 2) {
      const latestTop = tops[tops.length - 1];
      const prevTop = tops[tops.length - 2];

      // Case 1: Latest top is HIGHER, but RSI is LOWER
      if (latestTop.price > prevTop.price && latestTop.rsi < prevTop.rsi) {
        const priceChange = ((latestTop.price - prevTop.price) / prevTop.price) * 100;
        const rsiChange = latestTop.rsi - prevTop.rsi;
        const strength = Math.abs(rsiChange) > 10 ? 'STRONG' : Math.abs(rsiChange) > 5 ? 'MODERATE' : 'WEAK';
        
        return {
          type: 'BEARISH',
          strength,
          priceChange,
          rsiChange,
          description: `Price made higher high (+${priceChange.toFixed(2)}%) but RSI lower (${rsiChange.toFixed(2)})`
        };
      }

      // Case 2: Latest top is LOWER, but RSI is HIGHER
      if (latestTop.price < prevTop.price && latestTop.rsi > prevTop.rsi) {
        const priceChange = ((latestTop.price - prevTop.price) / prevTop.price) * 100;
        const rsiChange = latestTop.rsi - prevTop.rsi;
        const strength = Math.abs(rsiChange) > 10 ? 'STRONG' : Math.abs(rsiChange) > 5 ? 'MODERATE' : 'WEAK';
        
        return {
          type: 'BEARISH',
          strength,
          priceChange,
          rsiChange,
          description: `Price made lower high (${priceChange.toFixed(2)}%) but RSI higher (+${rsiChange.toFixed(2)})`
        };
      }
    }

    // Check for BULLISH divergence (check latest 2 bottoms)
    if (bottoms.length >= 2) {
      const latestBottom = bottoms[bottoms.length - 1];
      const prevBottom = bottoms[bottoms.length - 2];

      // Case 1: Latest bottom is HIGHER, but RSI is LOWER
      if (latestBottom.price > prevBottom.price && latestBottom.rsi < prevBottom.rsi) {
        const priceChange = ((latestBottom.price - prevBottom.price) / prevBottom.price) * 100;
        const rsiChange = latestBottom.rsi - prevBottom.rsi;
        const strength = Math.abs(rsiChange) > 10 ? 'STRONG' : Math.abs(rsiChange) > 5 ? 'MODERATE' : 'WEAK';
        
        return {
          type: 'BULLISH',
          strength,
          priceChange,
          rsiChange,
          description: `Price made higher low (+${priceChange.toFixed(2)}%) but RSI lower (${rsiChange.toFixed(2)})`
        };
      }

      // Case 2: Latest bottom is LOWER, but RSI is HIGHER
      if (latestBottom.price < prevBottom.price && latestBottom.rsi > prevBottom.rsi) {
        const priceChange = ((latestBottom.price - prevBottom.price) / prevBottom.price) * 100;
        const rsiChange = latestBottom.rsi - prevBottom.rsi;
        const strength = Math.abs(rsiChange) > 10 ? 'STRONG' : Math.abs(rsiChange) > 5 ? 'MODERATE' : 'WEAK';
        
        return {
          type: 'BULLISH',
          strength,
          priceChange,
          rsiChange,
          description: `Price made lower low (${priceChange.toFixed(2)}%) but RSI higher (+${rsiChange.toFixed(2)})`
        };
      }
    }

    return null;
  }

  /**
   * Get descriptive message for RSI signal
   */
  public static getSignalMessage(result: RSIResult): string {
    const { value, signal, strength } = result;

    if (signal === 'OVERSOLD') {
      const strengthText = strength === 'EXTREME' ? 'Extremely' : 
                          strength === 'STRONG' ? 'Strongly' :
                          strength === 'MODERATE' ? 'Moderately' : 'Slightly';
      return `RSI: ${value} - ${strengthText} OVERSOLD 🟢\nPotential buy opportunity`;
    } else if (signal === 'OVERBOUGHT') {
      const strengthText = strength === 'EXTREME' ? 'Extremely' : 
                          strength === 'STRONG' ? 'Strongly' :
                          strength === 'MODERATE' ? 'Moderately' : 'Slightly';
      return `RSI: ${value} - ${strengthText} OVERBOUGHT 🔴\nPotential sell signal`;
    } else {
      return `RSI: ${value} - NEUTRAL 🟡\nNo clear signal`;
    }
  }
}
