export type MLSignalDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface MLFeatureVector {
  /** Ordered, numeric feature vector */
  x: number[];
  /** Feature names in the same order as x */
  featureNames: string[];
}

/**
 * Minimal model format to keep inference inside Node/TS.
 * Train anywhere (Python), then export weights/bias to this JSON format.
 */
export interface LogisticModelJSON {
  modelType: 'logistic_regression';
  version: string;
  /** Must match the feature vector order used at inference time */
  featureNames: string[];
  /** Same length as featureNames */
  weights: number[];
  bias: number;
}

export interface MLSignalPrediction {
  /** Probability that price goes UP over the training horizon */
  probUp: number; // 0..1
  direction: MLSignalDirection;
  /** 0..100 */
  confidence: number;
  modelVersion: string;
}
