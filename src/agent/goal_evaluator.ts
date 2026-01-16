import { createModuleLogger } from '../config/logger';
import { Goal, GoalEvaluationResult } from '../types/goal.types';
import { PriceCache } from '../market/price_cache';
import { GoalManager } from './goal_manager';
import { ChannelPublisher } from '../telegram/channel_publisher';
import { GOAL_STATES, PRICE_CONDITIONS, GOAL_EVALUATION_INTERVAL_MS } from '../config/constants';

const logger = createModuleLogger('GoalEvaluator');

export class GoalEvaluator {
  private static instance: GoalEvaluator;
  private goalManager: GoalManager;
  private priceCache: PriceCache;
  private channelPublisher: ChannelPublisher;
  private evaluationTimer?: NodeJS.Timeout;
  private previousPrices: Map<string, number>;

  private constructor() {
    this.goalManager = GoalManager.getInstance();
    this.priceCache = PriceCache.getInstance();
    this.channelPublisher = ChannelPublisher.getInstance();
    this.previousPrices = new Map();
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

    // Get current price
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
