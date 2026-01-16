import { Request, Response } from 'express';
import { createModuleLogger } from '../../config/logger';
import { GoalManager } from '../../agent/goal_manager';

const logger = createModuleLogger('WebhooksController');

interface TradingViewAlert {
  action?: string;
  symbol?: string;
  price?: number;
  message?: string;
}

export class WebhooksController {
  private goalManager: GoalManager;

  constructor() {
    this.goalManager = GoalManager.getInstance();
  }

  handleTradingViewWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const alert: TradingViewAlert = req.body;
      logger.info('Received TradingView webhook', alert);

      // Parse and process the alert
      if (alert.action && alert.symbol && alert.price) {
        // Example: create a goal based on webhook
        // This is a simplified example - customize based on your needs
        await this.goalManager.createGoal({
          symbol: alert.symbol,
          condition: alert.action === 'BUY' ? 'ABOVE' : 'BELOW',
          targetPrice: alert.price,
          watchMode: 'ONCE',
          notifyChannel: true,
          autoTrade: false,
        });
      }

      res.status(200).json({
        success: true,
        message: 'Webhook processed',
      });
    } catch (error) {
      logger.error('Failed to process TradingView webhook', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  handleGenericWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = req.body;
      logger.info('Received generic webhook', payload);

      // Process generic webhook payload
      // Implement your custom logic here

      res.status(200).json({
        success: true,
        message: 'Webhook received',
      });
    } catch (error) {
      logger.error('Failed to process generic webhook', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
