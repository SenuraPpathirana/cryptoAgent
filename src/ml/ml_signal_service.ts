import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';
import { FeatureBuilder } from './feature_builder';
import { MLLogisticModel } from './logistic_model';
import { MLSignalPrediction } from './types';
import { RSIResult } from '../analysis/indicators/rsi';
import { MACDResult } from '../analysis/indicators/macd';
import { MAResult } from '../analysis/indicators/moving_averages';
import { BollingerBandsResult } from '../analysis/indicators/bollinger_bands';
import { TrendResult } from '../analysis/patterns/trend_detector';
import { SupportResistanceResult } from '../analysis/patterns/support_resistance';

const logger = createModuleLogger('MLSignalService');

export class MLSignalService {
  private static instance: MLSignalService;
  private model: MLLogisticModel | null = null;
  private enabled: boolean;

  private constructor() {
    this.enabled = env.ML_SIGNAL_ENABLED;

    if (this.enabled) {
      try {
        this.model = MLLogisticModel.loadFromFile(env.ML_SIGNAL_MODEL_PATH);
        logger.info(`ML signal model loaded successfully from ${env.ML_SIGNAL_MODEL_PATH}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Failed to load ML signal model. Falling back to rule-based signals only.', { 
          error: errorMsg,
          path: env.ML_SIGNAL_MODEL_PATH,
          stack: error instanceof Error ? error.stack : undefined
        });
        this.model = null;
        this.enabled = false;
      }
    }
  }

  public static getInstance(): MLSignalService {
    if (!MLSignalService.instance) {
      MLSignalService.instance = new MLSignalService();
    }
    return MLSignalService.instance;
  }

  public isEnabled(): boolean {
    return this.enabled && !!this.model;
  }

  /**
   * Returns ML prediction or null if ML is disabled/unavailable.
   */
  public predict(
    rsi: RSIResult | null,
    macd: MACDResult | null,
    ma: MAResult | null,
    bb: BollingerBandsResult | null,
    trend: TrendResult | null,
    sr: SupportResistanceResult | null
  ): MLSignalPrediction | null {
    if (!this.isEnabled() || !this.model) return null;

    try {
      const fv = FeatureBuilder.build(rsi, macd, ma, bb, trend, sr);

      // Ensure the inference feature order matches the model
      const modelNames = this.model.getFeatureNames();
      if (modelNames.length !== fv.featureNames.length) {
        throw new Error(`Feature count mismatch. model=${modelNames.length} code=${fv.featureNames.length}`);
      }
      for (let i = 0; i < modelNames.length; i++) {
        if (modelNames[i] !== fv.featureNames[i]) {
          throw new Error(
            `Feature order mismatch at index ${i}. model='${modelNames[i]}' code='${fv.featureNames[i]}'`
          );
        }
      }

      const probUp = this.model.predictProbUp(fv.x);

      // Confidence: distance from 0.5 mapped to 0..100
      const confidence = Math.round(Math.min(100, Math.abs(probUp - 0.5) * 2 * 100));

      const direction = probUp > 0.55 ? 'BULLISH' : probUp < 0.45 ? 'BEARISH' : 'NEUTRAL';

      return {
        probUp,
        direction,
        confidence,
        modelVersion: this.model.getVersion()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn('ML prediction failed. Using rule-based signals only for this run.', { 
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
      });
      return null;
    }
  }
}
