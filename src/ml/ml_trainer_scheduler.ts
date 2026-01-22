import { createModuleLogger } from '../config/logger';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const logger = createModuleLogger('MLTrainerScheduler');

export class MLTrainerScheduler {
  private static instance: MLTrainerScheduler;
  private intervalId?: NodeJS.Timeout;
  private isTraining: boolean = false;

  private constructor() {}

  public static getInstance(): MLTrainerScheduler {
    if (!MLTrainerScheduler.instance) {
      MLTrainerScheduler.instance = new MLTrainerScheduler();
    }
    return MLTrainerScheduler.instance;
  }

  /**
   * Start scheduled training
   * @param intervalHours How often to retrain (in hours)
   * @param runImmediately Whether to run training immediately on start
   */
  public start(intervalHours: number = 24, runImmediately: boolean = false): void {
    if (this.intervalId) {
      logger.warn('Trainer scheduler already running');
      return;
    }

    logger.info(`Starting ML trainer scheduler (every ${intervalHours} hours)`);

    // Run immediately if requested
    if (runImmediately) {
      this.runTraining().catch(err => {
        logger.error('Initial training failed', err);
      });
    }

    // Schedule periodic training
    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.intervalId = setInterval(() => {
      this.runTraining().catch(err => {
        logger.error('Scheduled training failed', err);
      });
    }, intervalMs);

    logger.info('ML trainer scheduler started');
  }

  /**
   * Stop the scheduler
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('ML trainer scheduler stopped');
    }
  }

  /**
   * Run training manually
   */
  public async runTraining(): Promise<void> {
    if (this.isTraining) {
      logger.warn('Training already in progress, skipping...');
      return;
    }

    this.isTraining = true;
    const startTime = Date.now();

    try {
      logger.info('Starting ML model training...');

      // Get training parameters from environment
      const symbols = (process.env.ML_TRAIN_SYMBOLS ?? 'BTCUSDT').split(',').map(s => s.trim());
      const timeframe = process.env.ML_TRAIN_TIMEFRAME ?? '1h';
      const lookahead = process.env.ML_TRAIN_LOOKAHEAD ?? '3';
      const upThreshold = process.env.ML_TRAIN_UP_THRESHOLD ?? '0.004';
      const downThreshold = process.env.ML_TRAIN_DOWN_THRESHOLD ?? '-0.004';

      // Step 1: Dump fresh candles
      logger.info('Step 1/3: Dumping fresh candles...');
      await this.runCommand('npm', ['run', 'ml:dump']);

      // Step 2: Train model for first symbol
      const symbol = symbols[0];
      const csvPath = path.resolve(`data/candles/${symbol}_${timeframe}.csv`);
      const modelPath = path.resolve('models/ml_signal_model.json');
      const tempModelPath = path.resolve('models/ml_signal_model.new.json');

      if (!fs.existsSync(csvPath)) {
        throw new Error(`Candles CSV not found: ${csvPath}`);
      }

      logger.info(`Step 2/3: Training model with ${symbol} data...`);
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      await this.runCommand(pythonCmd, [
        'src/ml/train_signal_model.py',
        '--csv', csvPath,
        '--out', tempModelPath,
        '--lookahead', lookahead,
        '--up', upThreshold,
        '--down', downThreshold
      ]);

      // Step 3: Atomically replace old model
      logger.info('Step 3/3: Replacing old model...');
      if (fs.existsSync(tempModelPath)) {
        fs.renameSync(tempModelPath, modelPath);
        logger.info(`✅ Model updated: ${modelPath}`);
      } else {
        throw new Error('New model file not created');
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`✅ ML training completed successfully in ${duration}s`);

    } catch (error) {
      logger.error('ML training failed', error);
      throw error;
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Helper to run shell commands
   */
  private runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: 'pipe',
        shell: true
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        // Log significant output
        if (text.includes('Saved') || text.includes('AUC') || text.includes('rows:')) {
          logger.info(text.trim());
        }
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}\nSTDERR: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Get scheduler status
   */
  public getStatus(): { running: boolean; training: boolean } {
    return {
      running: !!this.intervalId,
      training: this.isTraining
    };
  }
}
