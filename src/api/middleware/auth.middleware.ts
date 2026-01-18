import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { AuthService } from '../../auth/auth.service';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('AuthMiddleware');

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userEmail?: string;
    }
  }
}

const authService = AuthService.getInstance();

/**
 * Legacy API key middleware (backward compatibility)
 */
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

/**
 * JWT authentication middleware
 */
export async function jwtAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = authService.verifyToken(token);
    
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Attach user info to request
    req.userId = payload.userId;
    req.userEmail = payload.email;

    logger.debug('User authenticated', { userId: payload.userId });

    next();
  } catch (error) {
    logger.error('JWT authentication middleware error', { error });
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional JWT auth middleware - doesn't fail if no token
 */
export async function optionalJwtAuthMiddleware(
  req: Request,
  // @ts-ignore - res may be unused in this middleware
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = authService.verifyToken(token);
      
      if (payload) {
        req.userId = payload.userId;
        req.userEmail = payload.email;
      }
    }

    next();
  } catch (error) {
    logger.error('Optional JWT auth middleware error', { error });
    next();
  }
}
