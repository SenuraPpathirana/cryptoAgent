import { GoalManager } from '../src/agent/goal_manager';
import { logger } from '../src/config/logger';
import { SUPPORTED_SYMBOLS } from '../src/config/constants';

async function seed() {
  logger.info('🌱 Seeding sample goals...');

  const goalManager = GoalManager.getInstance();

  try {
    // Sample goal 1: BTC above 50k
    await goalManager.createGoal({
      symbol: 'BTCUSDT',
      targetPrice: 50000,
      condition: 'ABOVE',
      watchMode: 'ONCE',
      notifyChannel: true,
      autoTrade: false,
    });

    // Sample goal 2: ETH crosses above 3k
    await goalManager.createGoal({
      symbol: 'ETHUSDT',
      targetPrice: 3000,
      condition: 'CROSSES_ABOVE',
      watchMode: 'CONTINUOUS',
      notifyChannel: true,
      autoTrade: false,
    });

    // Sample goal 3: BNB below 300 with auto-trade
    await goalManager.createGoal({
      symbol: 'BNBUSDT',
      targetPrice: 300,
      condition: 'BELOW',
      watchMode: 'ONCE',
      notifyChannel: true,
      autoTrade: true,
      tradeConfig: {
        side: 'LONG',
        positionSizeUsdt: 100,
        leverage: 5,
        stopLossPercent: 2,
        takeProfitPercent: 5,
      },
    });

    logger.info('✅ Sample goals created successfully');
  } catch (error) {
    logger.error('Failed to seed goals', error);
  }
}

seed();
