import { Router } from 'express';
import { WebhooksController } from '../controllers/webhooks.controller';

export const webhooksRouter = Router();
const controller = new WebhooksController();

// TradingView webhook receiver
webhooksRouter.post('/tv', controller.handleTradingViewWebhook);

// Generic webhook receiver
webhooksRouter.post('/generic', controller.handleGenericWebhook);
