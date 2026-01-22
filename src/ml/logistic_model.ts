import fs from 'fs';
import path from 'path';
import { createModuleLogger } from '../config/logger';
import { LogisticModelJSON } from './types';

const logger = createModuleLogger('MLLogisticModel');

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export class MLLogisticModel {
  private model: LogisticModelJSON;

  constructor(model: LogisticModelJSON) {
    this.model = model;
  }

  public getVersion(): string {
    return this.model.version;
  }

  public getFeatureNames(): string[] {
    return this.model.featureNames;
  }

  public predictProbUp(x: number[]): number {
    const { weights, bias } = this.model;

    if (x.length !== weights.length) {
      throw new Error(`Feature length mismatch. x=${x.length} weights=${weights.length}`);
    }

    let z = bias;
    for (let i = 0; i < x.length; i++) {
      z += x[i] * weights[i];
    }

    const p = sigmoid(z);
    // Avoid hard 0/1 outputs
    return Math.max(1e-6, Math.min(1 - 1e-6, p));
  }

  /**
   * Load model JSON from a file path.
   * Path may be relative to project root.
   */
  public static loadFromFile(modelPath: string): MLLogisticModel {
    const resolved = path.isAbsolute(modelPath) ? modelPath : path.resolve(process.cwd(), modelPath);
    const raw = fs.readFileSync(resolved, 'utf8');
    const json = JSON.parse(raw) as LogisticModelJSON;

    if (!json || json.modelType !== 'logistic_regression') {
      throw new Error(`Unsupported or missing modelType in ${resolved}`);
    }

    if (!Array.isArray(json.featureNames) || !Array.isArray(json.weights)) {
      throw new Error(`Invalid model format in ${resolved}`);
    }

    if (json.featureNames.length !== json.weights.length) {
      throw new Error(
        `Model featureNames length (${json.featureNames.length}) does not match weights length (${json.weights.length}) in ${resolved}`
      );
    }

    logger.info(`Loaded ML logistic model v${json.version} from ${resolved} (${json.weights.length} features)`);
    return new MLLogisticModel(json);
  }
}
