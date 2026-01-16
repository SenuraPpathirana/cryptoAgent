import { createModuleLogger } from '../config/logger';
import { Goal, GoalEvaluationResult } from '../types/goal.types';
import { PriceCache } from '../market/price_cache';
import { GoalManager } from './goal_manager';
import { ChannelPublisher } from '../telegram/channel_publisher';
import { GOAL_STATES, PRICE_CONDITIONS, GOAL_EVALUATION_INTERVAL_MS } from '../config/constants';
import { BinanceDataFetcher } from '../market/binance_data_fetcher';
import { AnalysisEngine } from '../analysis/analysis_engine';
import { RSIIndicator } from '../analysis/indicators/rsi';

const logger = createModuleLogger('GoalEvaluator');

export class GoalEvaluator {
  private static instance: GoalEvaluator;
  private goalManager: GoalManager;
  private priceCache: PriceCache;
  private channelPublisher: ChannelPublisher;
  private dataFetcher: BinanceDataFetcher;
  private analysisEngine: AnalysisEngine;
  private evaluationTimer?: NodeJS.Timeout;
  private previousPrices: Map<string, number>;
  private lastDivergenceCheck: Map<string, { timestamp: number; type: string | null }>;

  private constructor() {
    this.goalManager = GoalManager.getInstance();
    this.priceCache = PriceCache.getInstance();
    this.channelPublisher = ChannelPublisher.getInstance();
    this.dataFetcher = BinanceDataFetcher.getInstance();
    this.analysisEngine = AnalysisEngine.getInstance();
    this.previousPrices = new Map();
    this.lastDivergenceCheck = new Map();
  }

  public static getInstance(): GoalEvaluator {
    if (!GoalEvaluator.instance) {
      GoalEvaluator.instance = new GoalEvaluator();
    }
    return GoalEvaluator.instance;
  }

  public start(): void {
    if (this.evaluationTimer) {
      logger.warn('Goal evaluator already running');
      return;
    }

    logger.info('Starting goal evaluator');
    this.evaluationTimer = setInterval(() => {
      this.evaluateAllGoals();
    }, GOAL_EVALUATION_INTERVAL_MS);

    // Run immediately
    this.evaluateAllGoals();
  }

  public stop(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = undefined;
      logger.info('Goal evaluator stopped');
    }
  }

  private async evaluateAllGoals(): Promise<void> {
    const activeGoals = await this.goalManager.getActiveGoals();
    
    if (activeGoals.length === 0) {
      return;
    }

    logger.debug(`Evaluating ${activeGoals.length} active goals`);

    for (const goal of activeGoals) {
      try {
        await this.evaluateGoal(goal);
      } catch (error) {
        logger.error(`Failed to evaluate goal ${goal.id}`, error);
      }
    }
  }

  private async evaluateGoal(goal: Goal): Promise<GoalEvaluationResult | null> {
    // Skip if not in WATCHING state
    if (goal.state !== GOAL_STATES.WATCHING) {
      return null;
    }

    // Check cooldown for recurring goals
    if (goal.lastTriggerAt && goal.cooldownMinutes) {
      const cooldownMs = goal.cooldownMinutes * 60 * 1000;
      const timeSinceLastTrigger = Date.now() - goal.lastTriggerAt.getTime();
      
      if (timeSinceLastTrigger < cooldownMs) {
        return null;
      }
    }

    // Check max triggers
    if (goal.maxTriggers && goal.triggerCount >= goal.maxTriggers) {
      await this.goalManager.markGoalCompleted(goal.id);
      return null;
    }

    // Handle divergence conditions separately
    if (goal.condition === PRICE_CONDITIONS.BULLISH_DIVERGENCE || 
        goal.condition === PRICE_CONDITIONS.BEARISH_DIVERGENCE ||
        goal.condition === PRICE_CONDITIONS.ANY_DIVERGENCE) {
      return await this.evaluateDivergenceGoal(goal);
    }

    // Get current price for regular price conditions
    const priceData = this.priceCache.getPrice(goal.symbol);
    if (!priceData) {
      logger.debug(`No price data for ${goal.symbol}`);
      return null;
    }

    const currentPrice = priceData.last;
    const previousPrice = this.previousPrices.get(goal.symbol) || currentPrice;

    // Evaluate condition
    const triggered = this.checkCondition(
      goal.condition,
      currentPrice,
      previousPrice,
      goal.targetPrice
    );

    // Update previous price
    this.previousPrices.set(goal.symbol, currentPrice);

    if (triggered) {
      logger.info(`Goal ${goal.id} triggered`, {
        symbol: goal.symbol,
        condition: goal.condition,
        targetPrice: goal.targetPrice,
        currentPrice,
      });

      await this.goalManager.markGoalTriggered(goal.id, currentPrice);

      // Send Telegram notification
      if (goal.notifyChannel) {
        try {
          const symbol = goal.symbol.replace('USDT', '');
          const conditionText = goal.condition === 'ABOVE' ? 'above' :
                                goal.condition === 'BELOW' ? 'below' :
                                goal.condition === 'CROSSES_ABOVE' ? 'crossed above' :
                                goal.condition === 'CROSSES_BELOW' ? 'crossed below' : goal.condition;
          
          const message = `🎯 *ALERT TRIGGERED*\n\n` +
            `${symbol} has ${conditionText} $${goal.targetPrice.toLocaleString()}\n\n` +
            `Current Price: $${currentPrice.toLocaleString()}\n` +
            `Goal ID: \`${goal.id}\`\n` +
            `Mode: ${goal.watchMode}\n` +
            `Triggers: ${goal.triggerCount + 1}`;
          
          await this.channelPublisher.publishCustomMessage(message);
          logger.info(`Telegram notification sent for goal ${goal.id}`);
        } catch (error) {
          logger.error(`Failed to send Telegram notification for goal ${goal.id}`, { error });
        }
      }

      return {
        goalId: goal.id,
        triggered: true,
        previousState: GOAL_STATES.WATCHING,
        newState: GOAL_STATES.TRIGGERED,
        timestamp: new Date(),
      };
    }

    return null;
  }

  /**
   * Evaluate divergence-based goals
   */
  private async evaluateDivergenceGoal(goal: Goal): Promise<GoalEvaluationResult | null> {
    try {
      // Check divergence every minute (not every evaluation cycle)
      const lastCheck = this.lastDivergenceCheck.get(goal.id);
      const now = Date.now();
      if (lastCheck && (now - lastCheck.timestamp) < 60000) {
        return null; // Skip if checked less than 1 minute ago
      }

      // Fetch recent candles for analysis
      const candles = await this.dataFetcher.getKlines(goal.symbol, '1m', 100);
      if (!candles || candles.length < 50) {
        logger.debug(`Insufficient candle data for divergence analysis: ${goal.symbol}`);
        return null;
      }

      // Convert candles to analysis format
      const closes = candles.map(c => c.close);
      
      // Calculate RSI values
      const rsiValues = closes.map((_, i) => {
        const slice = closes.slice(Math.max(0, i - 13), i + 1);
        if (slice.length < 14) return null;
        const result = RSIIndicator.calculate(slice, 14);
        return result ? result.value : null;
      }).filter(v => v !== null) as number[];

      // Detect divergence
      const divergence = RSIIndicator.detectDivergence(
        closes.slice(-rsiValues.length), 
        rsiValues
      );

      // Update last check
      this.lastDivergenceCheck.set(goal.id, {
        timestamp: now,
        type: divergence ? divergence.type : null
      });

      // Check if divergence matches goal condition
      let triggered = false;
      if (divergence) {
        if (goal.condition === PRICE_CONDITIONS.ANY_DIVERGENCE) {
          triggered = true;
        } else if (goal.condition === PRICE_CONDITIONS.BULLISH_DIVERGENCE && divergence.type === 'BULLISH') {
          triggered = true;
        } else if (goal.condition === PRICE_CONDITIONS.BEARISH_DIVERGENCE && divergence.type === 'BEARISH') {
          triggered = true;
        }
      }

      if (triggered && divergence) {
        const currentPrice = closes[closes.length - 1];
        
        logger.info(`Divergence goal ${goal.id} triggered`, {
          symbol: goal.symbol,
          divergenceType: divergence.type,
          strength: divergence.strength
        });

        await this.goalManager.markGoalTriggered(goal.id, currentPrice);

        // Send detailed Telegram notification
        if (goal.notifyChannel) {
          try {
            const symbol = goal.symbol.replace('USDT', '');
            const icon = divergence.type === 'BEARISH' ? '🔴' : '🟢';
            
            const message = `🎯 *DIVERGENCE ALERT*\n\n` +
              `${icon} ${divergence.strength} ${divergence.type} DIVERGENCE on ${symbol}!\n\n` +
              `${divergence.description}\n\n` +
              `Current Price: $${currentPrice.toLocaleString()}\n` +
              `Goal ID: \`${goal.id}\`\n` +
              `Mode: ${goal.watchMode}\n` +
              `Triggers: ${goal.triggerCount + 1}`;
            
            await this.channelPublisher.publishCustomMessage(message);
            logger.info(`Divergence notification sent for goal ${goal.id}`);
          } catch (error) {
            logger.error(`Failed to send divergence notification for goal ${goal.id}`, { error });
          }
        }

        return {
          goalId: goal.id,
          triggered: true,
          previousState: GOAL_STATES.WATCHING,
          newState: GOAL_STATES.TRIGGERED,
          timestamp: new Date(),
        };
      }

      return null;
    } catch (error) {
      logger.error(`Failed to evaluate divergence goal ${goal.id}`, { error });
      return null;
    }
  }

  private checkCondition(
    condition: string,
    currentPrice: number,
    previousPrice: number,
    targetPrice: number
  ): boolean {
    switch (condition) {
      case PRICE_CONDITIONS.ABOVE:
        return currentPrice >= targetPrice;

      case PRICE_CONDITIONS.BELOW:
        return currentPrice <= targetPrice;

      case PRICE_CONDITIONS.CROSSES_ABOVE:
        return previousPrice < targetPrice && currentPrice >= targetPrice;

      case PRICE_CONDITIONS.CROSSES_BELOW:
        return previousPrice > targetPrice && currentPrice <= targetPrice;

      default:
        logger.warn(`Unknown condition: ${condition}`);
        return false;
    }
  }

  public async evaluateGoalById(goalId: string): Promise<GoalEvaluationResult | null> {
    const goal = await this.goalManager.getGoal(goalId);
    if (!goal) {
      logger.warn(`Goal not found: ${goalId}`);
      return null;
    }

    return await this.evaluateGoal(goal);
  }
}
