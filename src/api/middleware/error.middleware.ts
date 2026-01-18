import { Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('ErrorMiddleware');

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorMiddleware = (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  logger.error('Request error', error, {
    path: req.path,
    method: req.method,
    statusCode,
  });

  res.status(statusCode).json({
    error: error.name || 'Error',
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
    }),
  });
};

export const createError = (message: string, statusCode: number = 500): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};
