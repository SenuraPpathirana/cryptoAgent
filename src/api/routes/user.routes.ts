import { Router, Request, Response } from 'express';
import { UsersRepository } from '../../storage/repositories/users.repo';
import { jwtAuthMiddleware } from '../middleware/auth.middleware';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('UserRoutes');
const router = Router();
const usersRepo = UsersRepository.getInstance();

// All routes require authentication
router.use(jwtAuthMiddleware);

/**
 * GET /api/user/config
 * Get user configuration
 */
router.get('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const config = await usersRepo.getUserConfig(userId);

    if (!config) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }

    // Don't expose sensitive data in full
    res.json({
      telegram_configured: !!config.telegram_bot_token,
      binance_configured: !!config.binance_api_key,
      binance_testnet: config.binance_testnet,
      trading_mode: config.trading_mode,
      default_leverage: config.default_leverage,
      max_position_size_usdt: config.max_position_size_usdt,
    });
  } catch (error) {
    logger.error('Failed to get user config', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

/**
 * POST /api/user/config/telegram
 * Update Telegram configuration
 */
router.post('/config/telegram', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { telegram_bot_token, telegram_channel_id } = req.body;

    if (!telegram_bot_token || !telegram_channel_id) {
      res.status(400).json({ error: 'telegram_bot_token and telegram_channel_id required' });
      return;
    }

    const success = await usersRepo.updateUserConfig(userId, {
      telegram_bot_token,
      telegram_channel_id,
    } as any);

    if (!success) {
      res.status(500).json({ error: 'Failed to update configuration' });
      return;
    }

    logger.info('Telegram config updated', { userId });

    res.json({ message: 'Telegram configuration updated successfully' });
  } catch (error) {
    logger.error('Failed to update Telegram config', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

/**
 * POST /api/user/config/binance
 * Update Binance configuration
 */
router.post('/config/binance', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { binance_api_key, binance_api_secret, binance_testnet } = req.body;

    logger.info('Binance config update request', { userId, hasApiKey: !!binance_api_key, hasApiSecret: !!binance_api_secret, testnet: binance_testnet });

    if (!binance_api_key || !binance_api_secret) {
      logger.warn('Missing Binance credentials in request', { userId, hasApiKey: !!binance_api_key, hasApiSecret: !!binance_api_secret });
      res.status(400).json({ error: 'binance_api_key and binance_api_secret required' });
      return;
    }

    // Convert boolean to 1 or 0 for SQLite
    const testnetValue = binance_testnet !== undefined ? (binance_testnet ? 1 : 0) : 1;

    const success = await usersRepo.updateUserConfig(userId, {
      binance_api_key,
      binance_api_secret,
      binance_testnet: testnetValue,
    } as any);

    if (!success) {
      logger.error('Failed to update user config in database', { userId });
      res.status(500).json({ error: 'Failed to update configuration in database' });
      return;
    }

    logger.info('Binance config updated successfully', { userId, testnet: testnetValue });

    res.json({ message: 'Binance configuration updated successfully' });
  } catch (error) {
    logger.error('Failed to update Binance config', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

/**
 * POST /api/user/config/trading
 * Update trading preferences
 */
router.post('/config/trading', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { trading_mode, default_leverage, max_position_size_usdt } = req.body;

    const updates: any = {};
    if (trading_mode) updates.trading_mode = trading_mode;
    if (default_leverage) updates.default_leverage = default_leverage;
    if (max_position_size_usdt) updates.max_position_size_usdt = max_position_size_usdt;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const success = await usersRepo.updateUserConfig(userId, updates);

    if (!success) {
      res.status(500).json({ error: 'Failed to update configuration' });
      return;
    }

    logger.info('Trading config updated', { userId, updates });

    res.json({ message: 'Trading preferences updated successfully' });
  } catch (error) {
    logger.error('Failed to update trading config', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

/**
 * GET /api/user/behavior
 * Get user behavior patterns
 */
router.get('/behavior', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 20;

    const behavior = await usersRepo.getUserBehavior(userId, limit);

    res.json({ behavior });
  } catch (error) {
    logger.error('Failed to get user behavior', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to get behavior data' });
  }
});

/**
 * GET /api/user/suggestions
 * Get AI-powered suggestions based on user behavior
 */
router.get('/suggestions', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const suggestions = await usersRepo.getSmartSuggestions(userId);

    res.json({ suggestions });
  } catch (error) {
    logger.error('Failed to get suggestions', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

/**
 * GET /api/user/history
 * Get chat history
 */
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 100;

    const history = await usersRepo.getChatHistory(userId, limit);

    res.json({ history });
  } catch (error) {
    logger.error('Failed to get chat history', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to get chat history' });
  }
});

export default router;
