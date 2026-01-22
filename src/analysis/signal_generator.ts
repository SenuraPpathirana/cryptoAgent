import { RSIResult } from './indicators/rsi';
import { MACDResult } from './indicators/macd';
import { MAResult } from './indicators/moving_averages';
import { BollingerBandsResult } from './indicators/bollinger_bands';
import { TrendResult } from './patterns/trend_detector';
import { SupportResistanceResult } from './patterns/support_resistance';
import { env } from '../config/env';
import { MLSignalService } from '../ml/ml_signal_service';

export interface TradingSignal {
  action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number; // 0-100
  reasons: string[];
  warnings: string[];

  /**
   * Optional ML metadata (present only when ML_SIGNAL_ENABLED=true and model loads)
   */
  ml?: {
    probUp: number; // 0..1
    mlConfidence: number; // 0..100
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    modelVersion: string;
    weight: number; // 0..1 (how much ML contributed to final score)
  };
}

export class SignalGenerator {
  /**
   * Generate trading signal based on all technical indicators.
   *
   * If ML is enabled (see env.ts), we blend:
   * - ruleScore: your existing point-based system (-100..+100)
   * - mlScore: derived from ML probUp mapped to (-100..+100)
   */
  public static generate(
    rsi: RSIResult | null,
    macd: MACDResult | null,
    ma: MAResult | null,
    bb: BollingerBandsResult | null,
    trend: TrendResult | null,
    sr: SupportResistanceResult | null
  ): TradingSignal {
    let bullishPoints = 0;
    let bearishPoints = 0;
    const reasons: string[] = [];
    const warnings: string[] = [];

    // RSI Analysis (weight: 15 points)
    if (rsi) {
      if (rsi.signal === 'OVERSOLD') {
        const points = rsi.strength === 'EXTREME' ? 15 : rsi.strength === 'STRONG' ? 12 : 10;
        bullishPoints += points;
        reasons.push(`RSI oversold (${rsi.value}) - buy signal`);
      } else if (rsi.signal === 'OVERBOUGHT') {
        const points = rsi.strength === 'EXTREME' ? 15 : rsi.strength === 'STRONG' ? 12 : 10;
        bearishPoints += points;
        reasons.push(`RSI overbought (${rsi.value}) - sell signal`);
      }
    }

    // MACD Analysis (weight: 20 points)
    if (macd) {
      if (macd.crossover === 'BULLISH') {
        bullishPoints += 20;
        reasons.push('MACD bullish crossover');
      } else if (macd.crossover === 'BEARISH') {
        bearishPoints += 20;
        reasons.push('MACD bearish crossover');
      } else if (macd.trend === 'BULLISH') {
        bullishPoints += 10;
        reasons.push('MACD in bullish position');
      } else if (macd.trend === 'BEARISH') {
        bearishPoints += 10;
        reasons.push('MACD in bearish position');
      }
    }

    // Moving Averages Analysis (weight: 20 points)
    if (ma) {
      if (ma.goldenCross) {
        bullishPoints += 20;
        reasons.push('Golden Cross detected!');
      } else if (ma.deathCross) {
        bearishPoints += 20;
        reasons.push('Death Cross detected!');
      } else if (ma.trend === 'STRONG_UPTREND') {
        bullishPoints += 15;
        reasons.push('Strong uptrend (all MAs aligned)');
      } else if (ma.trend === 'UPTREND') {
        bullishPoints += 10;
        reasons.push('Uptrend detected');
      } else if (ma.trend === 'STRONG_DOWNTREND') {
        bearishPoints += 15;
        reasons.push('Strong downtrend (all MAs aligned)');
      } else if (ma.trend === 'DOWNTREND') {
        bearishPoints += 10;
        reasons.push('Downtrend detected');
      }
    }

    // Bollinger Bands Analysis (weight: 15 points)
    if (bb) {
      if (bb.position === 'BELOW_LOWER') {
        bullishPoints += 15;
        reasons.push('Price below lower Bollinger Band - oversold');
      } else if (bb.position === 'ABOVE_UPPER') {
        bearishPoints += 15;
        reasons.push('Price above upper Bollinger Band - overbought');
      } else if (bb.position === 'NEAR_LOWER') {
        bullishPoints += 8;
        reasons.push('Price near lower band');
      } else if (bb.position === 'NEAR_UPPER') {
        bearishPoints += 8;
        reasons.push('Price near upper band');
      }

      if (bb.squeeze) {
        warnings.push('Bollinger squeeze detected - volatility breakout imminent');
      }
    }

    // Trend Analysis (weight: 15 points)
    if (trend) {
      if (trend.direction === 'UPTREND') {
        const points = trend.strength === 'STRONG' ? 15 : trend.strength === 'MODERATE' ? 10 : 5;
        bullishPoints += points;
        reasons.push(`${trend.strength.toLowerCase()} uptrend (${trend.trendDuration} candles)`);
      } else if (trend.direction === 'DOWNTREND') {
        const points = trend.strength === 'STRONG' ? 15 : trend.strength === 'MODERATE' ? 10 : 5;
        bearishPoints += points;
        reasons.push(`${trend.strength.toLowerCase()} downtrend (${trend.trendDuration} candles)`);
      }
    }

    // Support/Resistance Analysis (weight: 15 points)
    if (sr) {
      if (sr.position === 'NEAR_RESISTANCE') {
        bearishPoints += 10;
        warnings.push('Price near resistance - watch for rejection');
      } else if (sr.position === 'NEAR_SUPPORT') {
        bullishPoints += 10;
        warnings.push('Price near support - watch for bounce');
      } else if (sr.position === 'BREAKOUT_ABOVE') {
        bullishPoints += 15;
        reasons.push('Breakout above resistance');
      } else if (sr.position === 'BREAKDOWN_BELOW') {
        bearishPoints += 15;
        reasons.push('Breakdown below support');
      }
    }

    // ----- Rule score (-100..+100 roughly) -----
    const ruleScore = bullishPoints - bearishPoints;
    const maxPoints = 100;
    const ruleConfidence = Math.round((Math.abs(ruleScore) / maxPoints) * 100);

    // ----- Optional ML blend -----
    const mlService = MLSignalService.getInstance();
    const mlPred = mlService.predict(rsi, macd, ma, bb, trend, sr);

    let finalScore = ruleScore;
    let finalConfidence = Math.min(100, ruleConfidence);
    let mlMeta: TradingSignal['ml'] = undefined;

    if (mlPred) {
      const w = Math.max(0, Math.min(1, env.ML_SIGNAL_WEIGHT));

      // Map probUp (0..1) -> mlScore (-100..+100)
      const mlScore = (mlPred.probUp - 0.5) * 2 * 100;

      finalScore = (1 - w) * ruleScore + w * mlScore;
      finalConfidence = Math.round((1 - w) * Math.min(100, ruleConfidence) + w * mlPred.confidence);

      reasons.unshift(
        `ML model v${mlPred.modelVersion}: probUp ${(mlPred.probUp * 100).toFixed(1)}% (blend weight ${(w * 100).toFixed(0)}%)`
      );

      mlMeta = {
        probUp: mlPred.probUp,
        mlConfidence: mlPred.confidence,
        direction: mlPred.direction,
        modelVersion: mlPred.modelVersion,
        weight: w
      };
    }

    // Determine action (based on FINAL score)
    let action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

    if (finalScore >= 50) {
      action = 'STRONG_BUY';
    } else if (finalScore >= 20) {
      action = 'BUY';
    } else if (finalScore <= -50) {
      action = 'STRONG_SELL';
    } else if (finalScore <= -20) {
      action = 'SELL';
    } else {
      action = 'HOLD';
    }

    return {
      action,
      confidence: Math.min(100, finalConfidence),
      reasons,
      warnings,
      ...(mlMeta ? { ml: mlMeta } : {})
    };
  }

  /**
   * Get descriptive message for trading signal
   */
  public static getSignalMessage(signal: TradingSignal): string {
    let message = '';

    // Action with emoji
    switch (signal.action) {
      case 'STRONG_BUY':
        message += '🟢🟢 STRONG BUY SIGNAL 🟢🟢\n';
        break;
      case 'BUY':
        message += '🟢 BUY SIGNAL 🟢\n';
        break;
      case 'HOLD':
        message += '🟡 HOLD 🟡\n';
        break;
      case 'SELL':
        message += '🔴 SELL SIGNAL 🔴\n';
        break;
      case 'STRONG_SELL':
        message += '🔴🔴 STRONG SELL SIGNAL 🔴🔴\n';
        break;
    }

    message += `Confidence: ${signal.confidence}%\n\n`;

    // Reasons
    if (signal.reasons.length > 0) {
      message += 'Key Factors:\n';
      signal.reasons.forEach(reason => {
        message += `• ${reason}\n`;
      });
      message += '\n';
    }

    // Warnings
    if (signal.warnings.length > 0) {
      message += '⚠️ Warnings:\n';
      signal.warnings.forEach(warning => {
        message += `• ${warning}\n`;
      });
    }

    return message.trim();
  }
}
