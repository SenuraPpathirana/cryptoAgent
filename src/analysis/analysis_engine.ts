import { createModuleLogger } from '../config/logger';
import { RSIIndicator, RSIResult } from './indicators/rsi';
import { MACDIndicator, MACDResult } from './indicators/macd';
import { MovingAverageIndicator, MAResult } from './indicators/moving_averages';
import { BollingerBandsIndicator, BollingerBandsResult } from './indicators/bollinger_bands';
import { TrendDetector, TrendResult } from './patterns/trend_detector';
import { SupportResistanceDetector, SupportResistanceResult } from './patterns/support_resistance';
import { SignalGenerator, TradingSignal } from './signal_generator';

const logger = createModuleLogger('AnalysisEngine');

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface ComprehensiveAnalysis {
  symbol: string;
  timestamp: Date;
  currentPrice: number;
  rsi: RSIResult | null;
  macd: MACDResult | null;
  movingAverages: MAResult | null;
  bollingerBands: BollingerBandsResult | null;
  trend: TrendResult | null;
  supportResistance: SupportResistanceResult | null;
  signal: TradingSignal;
  summary: string;
}

export class AnalysisEngine {
  private static instance: AnalysisEngine;

  private constructor() {}

  public static getInstance(): AnalysisEngine {
    if (!AnalysisEngine.instance) {
      AnalysisEngine.instance = new AnalysisEngine();
    }
    return AnalysisEngine.instance;
  }

  /**
   * Perform comprehensive technical analysis on candle data
   */
  public analyze(symbol: string, candles: CandleData[], timeframe: string = '1h'): ComprehensiveAnalysis | null {
    if (candles.length < 20) {
      logger.warn(`Insufficient candle data for analysis. Need at least 20, got ${candles.length}`);
      return null;
    }

    try {
      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const opens = candles.map(c => c.open);
      const currentPrice = closes[closes.length - 1];

      logger.info(`Analyzing ${symbol} with ${candles.length} candles on ${timeframe} timeframe`);

      // Calculate all indicators
      const rsi = RSIIndicator.calculate(closes);
      const macd = MACDIndicator.calculate(closes);
      const movingAverages = MovingAverageIndicator.calculate(closes);
      const bollingerBands = BollingerBandsIndicator.calculate(closes);
      const trend = TrendDetector.detect(highs, lows, closes);
      const supportResistance = SupportResistanceDetector.detect(highs, lows, closes, opens, 50, 0.5, timeframe);

      // Generate trading signal
      const signal = SignalGenerator.generate(
        rsi,
        macd,
        movingAverages,
        bollingerBands,
        trend,
        supportResistance
      );

      // Generate summary
      const summary = this.generateSummary(
        symbol,
        currentPrice,
        rsi,
        macd,
        movingAverages,
        bollingerBands,
        trend,
        supportResistance,
        signal
      );

      return {
        symbol,
        timestamp: new Date(),
        currentPrice,
        rsi,
        macd,
        movingAverages,
        bollingerBands,
        trend,
        supportResistance,
        signal,
        summary
      };
    } catch (error) {
      logger.error(`Analysis failed for ${symbol}`, { error });
      return null;
    }
  }

  /**
   * Quick analysis - just essential indicators for chat responses
   */
  public quickAnalyze(symbol: string, candles: CandleData[]): string {
    if (candles.length < 14) {
      return `❌ Not enough data to analyze ${symbol}. Need at least 14 candles.`;
    }

    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];

    const rsi = RSIIndicator.calculate(closes, 14);
    const macd = MACDIndicator.calculate(closes);
    
    let message = `📊 Quick Analysis for ${symbol}\n`;
    message += `Price: $${currentPrice.toLocaleString()}\n\n`;

    if (rsi) {
      message += `${RSIIndicator.getSignalMessage(rsi)}\n\n`;
    }

    if (macd) {
      message += `${MACDIndicator.getSignalMessage(macd)}`;
    }

    return message;
  }

  /**
   * Get only RSI info (overbought/oversold)
   */
  public analyzeRSI(symbol: string, candles: CandleData[]): string {
    if (candles.length < 14) return `❌ Not enough data for RSI analysis.`;
    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    const rsi = RSIIndicator.calculate(closes, 14);
    
    if (!rsi) return `❌ Unable to calculate RSI.`;
    
    return `📈 ${symbol} RSI Analysis\nPrice: $${currentPrice.toLocaleString()}\n\n${RSIIndicator.getSignalMessage(rsi)}`;
  }

  /**
   * Get only divergence info
   */
  public analyzeDivergence(symbol: string, candles: CandleData[]): string {
    if (candles.length < 50) return `❌ Need at least 50 candles for divergence analysis.`;
    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    
    // Check RSI divergence
    const rsiValues = closes.map((_, i) => {
      const slice = closes.slice(Math.max(0, i - 13), i + 1);
      if (slice.length < 14) return null;
      const result = RSIIndicator.calculate(slice, 14);
      return result ? result.value : null;
    }).filter(v => v !== null) as number[];

    const rsiDiv = RSIIndicator.detectDivergence(closes.slice(-rsiValues.length), rsiValues);
    
    let message = `📊 ${symbol} Divergence Analysis\nPrice: $${currentPrice.toLocaleString()}\n\n`;
    
    if (rsiDiv) {
      const icon = rsiDiv.type === 'BEARISH' ? '🔴' : '🟢';
      message += `${icon} ${rsiDiv.strength} ${rsiDiv.type} RSI DIVERGENCE DETECTED!\n\n`;
      message += `${rsiDiv.description}\n\n`;
      if (rsiDiv.type === 'BULLISH') {
        message += `💡 This suggests potential reversal to upside.\n`;
        message += `Watch for buy signals and confirmation.`;
      } else {
        message += `⚠️ This suggests potential reversal to downside.\n`;
        message += `Consider taking profits or setting stop losses.`;
      }
    } else {
      message += `✅ No clear divergence detected at this time.\n\n`;
      message += `Current RSI: ${rsiValues[rsiValues.length - 1]?.toFixed(2) || 'N/A'}\n`;
      message += `Monitoring for divergence patterns...`;
    }
    
    return message;
  }

  /**
   * Get only support/resistance levels
   */
  public analyzeSupportResistance(symbol: string, candles: CandleData[], timeframe: string = '1h'): string {
    if (candles.length < 30) return `Need at least 30 candles for S/R analysis.`;
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);
    const opens = candles.map(c => c.open);
    const currentPrice = closes[closes.length - 1];
    
    const sr = SupportResistanceDetector.detect(highs, lows, closes, opens, 50, 0.5, timeframe);
    if (!sr) return `Unable to detect support/resistance levels.`;
    
    // Format price with appropriate decimals (more for altcoins under $100)
    const formatPrice = (price: number) => {
      if (price >= 1000) return price.toFixed(0);
      if (price >= 100) return price.toFixed(1);
      if (price >= 1) return price.toFixed(2);
      return price.toFixed(4);
    };
    
    const priceFormatted = formatPrice(currentPrice);
    let message = `━━━━━━━━━━━━━━━━━━\n${symbol} – RESISTANCE LEVELS (${timeframe.toUpperCase()})\n━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `Price:\n$${priceFormatted}\n\n`;
    
    // Key Resistance
    if (sr.resistance.length > 0) {
      message += `Key Resistance (Body Close):\n`;
      sr.resistance.forEach((level, idx) => {
        const price = formatPrice(level.price);
        const label = idx === 0 ? ' (nearest)' : '';
        message += `• $${price}${label}\n`;
      });
      message += '\n';
    }
    
    // Support
    if (sr.support.length > 0) {
      message += `Support (Body Close):\n`;
      sr.support.forEach((level, idx) => {
        const price = formatPrice(level.price);
        const label = idx === 0 ? ' (nearest)' : '';
        message += `• $${price}${label}\n`;
      });
      message += '\n';
    }
    
    // Market Context
    message += `Market Context:\n`;
    switch (sr.position) {
      case 'NEAR_RESISTANCE':
        message += `Price trading just below resistance\nWatch for rejection or clean body-close breakout`;
        break;
      case 'NEAR_SUPPORT':
        message += `Price testing support level\nWatch for bounce or body-close breakdown`;
        break;
      case 'BREAKOUT_ABOVE':
        message += `Price broke above resistance\nBullish if holds with body closes`;
        break;
      case 'BREAKDOWN_BELOW':
        message += `Price broke below support\nBearish if confirmed with body closes`;
        break;
      case 'BETWEEN':
        message += `Price between support and resistance\nRoom to move either direction`;
        break;
    }
    
    if (sr.trendBroken) {
      message += `\n\nTREND BREAK: Candle closed through previous wicks`;
    }
    
    message += `\n\n━━━━━━━━━━━━━━━━━━`;
    
    return message;
  }

  /**
   * Get only trend info
   */
  public analyzeTrend(symbol: string, candles: CandleData[]): string {
    if (candles.length < 20) return `❌ Need at least 20 candles for trend analysis.`;
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    
    const trend = TrendDetector.detect(highs, lows, closes);
    if (!trend) return `❌ Unable to detect trend.`;
    
    return `📈 ${symbol} Trend Analysis\nPrice: $${currentPrice.toLocaleString()}\n\n${TrendDetector.getSignalMessage(trend)}`;
  }

  /**
   * Get only MACD info
   */
  public analyzeMacd(symbol: string, candles: CandleData[]): string {
    if (candles.length < 26) return `❌ Need at least 26 candles for MACD analysis.`;
    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];
    
    const macd = MACDIndicator.calculate(closes);
    if (!macd) return `❌ Unable to calculate MACD.`;
    
    return `📊 ${symbol} MACD Analysis\nPrice: $${currentPrice.toLocaleString()}\n\n${MACDIndicator.getSignalMessage(macd)}`;
  }

  /**
   * Generate comprehensive summary
   */
  private generateSummary(
    symbol: string,
    currentPrice: number,
    rsi: RSIResult | null,
    macd: MACDResult | null,
    ma: MAResult | null,
    bb: BollingerBandsResult | null,
    trend: TrendResult | null,
    sr: SupportResistanceResult | null,
    signal: TradingSignal
  ): string {
    let summary = `📊 COMPREHENSIVE ANALYSIS: ${symbol}\n`;
    summary += `═══════════════════════════════\n\n`;
    summary += `💰 Current Price: $${currentPrice.toLocaleString()}\n\n`;

    // Signal
    summary += SignalGenerator.getSignalMessage(signal);
    summary += '\n\n═══════════════════════════════\n\n';

    // RSI
    if (rsi) {
      summary += `📈 RSI INDICATOR:\n`;
      summary += RSIIndicator.getSignalMessage(rsi);
      summary += '\n\n';
    }

    // MACD
    if (macd) {
      summary += `📊 MACD INDICATOR:\n`;
      summary += MACDIndicator.getSignalMessage(macd);
      summary += '\n\n';
    }

    // Moving Averages
    if (ma) {
      summary += MovingAverageIndicator.getSignalMessage(ma);
      summary += '\n\n';
    }

    // Bollinger Bands
    if (bb) {
      summary += BollingerBandsIndicator.getSignalMessage(bb);
      summary += '\n\n';
    }

    // Trend
    if (trend) {
      summary += TrendDetector.getSignalMessage(trend);
      summary += '\n\n';
    }

    // Support/Resistance
    if (sr) {
      summary += SupportResistanceDetector.getSignalMessage(sr, currentPrice);
      summary += '\n\n';
    }

    summary += '═══════════════════════════════\n';
    summary += '⚠️ This is not financial advice. DYOR.\n';

    return summary;
  }

  /**
   * Check if specific conditions are met for goal-based analysis
   */
  public checkCondition(
    candles: CandleData[],
    condition: 'RSI_OVERSOLD' | 'RSI_OVERBOUGHT' | 'MACD_BULLISH' | 'MACD_BEARISH' | 'BREAKOUT' | 'BREAKDOWN'
  ): boolean {
    if (candles.length < 20) return false;

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    switch (condition) {
      case 'RSI_OVERSOLD': {
        const rsi = RSIIndicator.calculate(closes);
        return rsi !== null && rsi.signal === 'OVERSOLD';
      }

      case 'RSI_OVERBOUGHT': {
        const rsi = RSIIndicator.calculate(closes);
        return rsi !== null && rsi.signal === 'OVERBOUGHT';
      }

      case 'MACD_BULLISH': {
        const macd = MACDIndicator.calculate(closes);
        return macd !== null && macd.crossover === 'BULLISH';
      }

      case 'MACD_BEARISH': {
        const macd = MACDIndicator.calculate(closes);
        return macd !== null && macd.crossover === 'BEARISH';
      }

      case 'BREAKOUT': {
        const sr = SupportResistanceDetector.detect(highs, lows, closes);
        return sr !== null && sr.position === 'BREAKOUT_ABOVE';
      }

      case 'BREAKDOWN': {
        const sr = SupportResistanceDetector.detect(highs, lows, closes);
        return sr !== null && sr.position === 'BREAKDOWN_BELOW';
      }

      default:
        return false;
    }
  }
}
