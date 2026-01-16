import { Router, Request, Response } from 'express';
import { env } from '../../config/env';

export const healthRouter = Router();

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  services?: {
    database?: boolean;
    websocket?: boolean;
    telegram?: boolean;
  };
}

healthRouter.get('/', async (req: Request, res: Response) => {
  try {
    const health: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      version: '1.0.0',
    };

    res.status(200).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
