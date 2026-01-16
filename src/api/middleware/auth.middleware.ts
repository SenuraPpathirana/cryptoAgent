import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('AuthMiddleware');

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // If no API key is configured, allow all requests
    if (!env.API_KEY) {
      return next();
    }

    // Check for API key in headers
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required',
      });
      return;
    }

    if (apiKey !== env.API_KEY) {
      logger.warn('Invalid API key attempt', { ip: req.ip });
      res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid API key',
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Auth middleware error', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
};
