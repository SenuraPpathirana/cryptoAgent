import { RSIResult } from '../analysis/indicators/rsi';
import { MACDResult } from '../analysis/indicators/macd';
import { MAResult } from '../analysis/indicators/moving_averages';
import { BollingerBandsResult } from '../analysis/indicators/bollinger_bands';
import { TrendResult } from '../analysis/patterns/trend_detector';
import { SupportResistanceResult } from '../analysis/patterns/support_resistance';
import { MLFeatureVector } from './types';
import { createModuleLogger } from '../config/logger';

const logger = createModuleLogger('FeatureBuilder');

/**
 * Converts indicator outputs into a stable, numeric feature vector.
 * 
 * CRITICAL: Feature order MUST match train_signal_model.py exactly:
 * ["rsi14", "macd", "macd_signal", "ema50_dist", "atr14_pct", "vol_z50"]
 * 
 * NOTE: We approximate some features since not all raw data is available at inference time.
 */
export class FeatureBuilder {
  public static build(
    rsi: RSIResult | null,
    macd: MACDResult | null,
    ma: MAResult | null,
    bb: BollingerBandsResult | null,
    trend: TrendResult | null,
    sr: SupportResistanceResult | null
  ): MLFeatureVector {
    // Feature names in EXACT order as Python training
    const featureNames = ["rsi14", "macd", "macd_signal", "ema50_dist", "atr14_pct", "vol_z50"];
    
    // rsi14: RSI value (0-100)
    const rsi14 = rsi?.value ?? 50; // neutral default
    
    // macd: MACD line value
    const macdValue = macd?.macd ?? 0;
    
    // macd_signal: MACD signal line value
    const macdSignal = macd?.signal ?? 0;
    
    // ema50_dist: (close - ema50) / close
    // We don't have EMA50 directly, but we have SMA50. Use as approximation.
    // Calculate distance as percentage: if price is 100 and SMA50 is 98, dist = (100-98)/100 = 0.02
    let ema50Dist = 0;
    if (ma?.sma50) {
      // We need current price - approximate from trend strength or use a middle value
      // For now, assume neutral (0) since we don't have exact close price here
      // This is a limitation - ideally we'd pass current price
      ema50Dist = 0; // TODO: Pass current price to calculate properly
    }
    
    // atr14_pct: ATR as percentage of close
    // Approximate using Bollinger Bandwidth which measures volatility
    let atr14Pct = 0;
    if (bb?.bandwidth) {
      atr14Pct = bb.bandwidth / 100; // bandwidth is already a percentage
    }
    
    // vol_z50: zscore of volume over 50 periods
    // We don't have volume data at inference, default to 0
    const volZ50 = 0;
    
    // Ensure all values are finite and reasonable
    const x = [
      Number.isFinite(rsi14) ? rsi14 : 50,
      Number.isFinite(macdValue) ? macdValue : 0,
      Number.isFinite(macdSignal) ? macdSignal : 0,
      Number.isFinite(ema50Dist) ? ema50Dist : 0,
      Number.isFinite(atr14Pct) ? atr14Pct : 0,
      Number.isFinite(volZ50) ? volZ50 : 0
    ];

    logger.debug('Built feature vector', { 
      features: featureNames.map((name, i) => `${name}=${x[i]}`).join(', ')
    });

    return { x, featureNames };
  }
}
