import { GoalEvaluator } from '../src/agent/goal_evaluator';
import { GoalManager } from '../src/agent/goal_manager';
import { PriceCache } from '../src/market/price_cache';
import { GOAL_STATES } from '../src/config/constants';

describe('GoalEvaluator', () => {
  let evaluator: GoalEvaluator;
  let goalManager: GoalManager;
  let priceCache: PriceCache;

  beforeEach(() => {
    evaluator = GoalEvaluator.getInstance();
    goalManager = GoalManager.getInstance();
    priceCache = PriceCache.getInstance();
  });

  afterEach(() => {
    evaluator.stop();
    priceCache.clear();
  });

  test('should trigger goal when price goes above target', async () => {
    // Create goal
    const goal = await goalManager.createGoal({
      symbol: 'BTCUSDT',
      targetPrice: 50000,
      condition: 'ABOVE',
      watchMode: 'ONCE',
      notifyChannel: false,
      autoTrade: false,
    });

    // Update price above target
    priceCache.updatePrice('BTCUSDT', {
      symbol: 'BTCUSDT',
      bid: 50100,
      ask: 50100,
      last: 50100,
      timestamp: Date.now(),
    });

    // Evaluate goal
    const result = await evaluator.evaluateGoalById(goal.id);

    expect(result).not.toBeNull();
    expect(result?.triggered).toBe(true);
    expect(result?.newState).toBe(GOAL_STATES.TRIGGERED);
  });

  test('should not trigger goal when price below target', async () => {
    // Create goal
    const goal = await goalManager.createGoal({
      symbol: 'BTCUSDT',
      targetPrice: 50000,
      condition: 'ABOVE',
      watchMode: 'ONCE',
      notifyChannel: false,
      autoTrade: false,
    });

    // Update price below target
    priceCache.updatePrice('BTCUSDT', {
      symbol: 'BTCUSDT',
      bid: 49000,
      ask: 49000,
      last: 49000,
      timestamp: Date.now(),
    });

    // Evaluate goal
    const result = await evaluator.evaluateGoalById(goal.id);

    expect(result).toBeNull();
  });

  test('should handle CROSSES_ABOVE condition', async () => {
    const goal = await goalManager.createGoal({
      symbol: 'ETHUSDT',
      targetPrice: 3000,
      condition: 'CROSSES_ABOVE',
      watchMode: 'ONCE',
      notifyChannel: false,
      autoTrade: false,
    });

    // First update: below target
    priceCache.updatePrice('ETHUSDT', {
      symbol: 'ETHUSDT',
      bid: 2900,
      ask: 2900,
      last: 2900,
      timestamp: Date.now(),
    });

    await evaluator.evaluateGoalById(goal.id);

    // Second update: crosses above target
    priceCache.updatePrice('ETHUSDT', {
      symbol: 'ETHUSDT',
      bid: 3100,
      ask: 3100,
      last: 3100,
      timestamp: Date.now(),
    });

    const result = await evaluator.evaluateGoalById(goal.id);

    expect(result).not.toBeNull();
    expect(result?.triggered).toBe(true);
  });
});
