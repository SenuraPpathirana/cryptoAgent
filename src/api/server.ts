import express, { Application } from 'express';
import { createServer as createHTTPServer, Server } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env';
import { createModuleLogger } from '../config/logger';
import { healthRouter } from './routes/health.routes';
import { goalsRouter } from './routes/goals.routes';
import { webhooksRouter } from './routes/webhooks.routes';
import { chatRouter } from './routes/chat.routes';
import { errorMiddleware } from './middleware/error.middleware';
import { authMiddleware } from './middleware/auth.middleware';

const logger = createModuleLogger('API');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class APIServer {
  private app: Application;
  private httpServer: Server;
  private wss: WebSocketServer;
  private port: number;

  constructor(port: number = env.PORT) {
    this.app = express();
    this.httpServer = createHTTPServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' });
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, {
        body: req.body,
        query: req.query,
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Serve static files (chat UI)
    const publicPath = path.join(__dirname, '../../public');
    this.app.use(express.static(publicPath));

    // Public routes
    this.app.use('/health', healthRouter);
    this.app.use('/api/chat', chatRouter);

    // Protected routes (if API key is configured)
    if (env.API_KEY) {
      this.app.use('/goals', authMiddleware, goalsRouter);
      this.app.use('/webhooks', authMiddleware, webhooksRouter);
    } else {
      this.app.use('/goals', goalsRouter);
      this.app.use('/webhooks', webhooksRouter);
    }

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorMiddleware);
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      logger.info('WebSocket client connected');

      // Import PriceCache dynamically to avoid circular dependencies
      import('../market/price_cache.js').then(({ PriceCache }) => {
        const priceCache = PriceCache.getInstance();

        // Send prices every 2 seconds
        const interval = setInterval(() => {
          const pricesData = {
            type: 'price',
            prices: {
              BTCUSDT: priceCache.getPrice('BTCUSDT')?.mark || 0,
              ETHUSDT: priceCache.getPrice('ETHUSDT')?.mark || 0,
              BNBUSDT: priceCache.getPrice('BNBUSDT')?.mark || 0,
            }
          };
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(pricesData));
          }
        }, 2000);

        ws.on('close', () => {
          clearInterval(interval);
          logger.info('WebSocket client disconnected');
        });
      });
    });
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, () => {
        logger.info(`API server listening on port ${this.port}`);
        logger.info(`🌐 Chat UI available at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  public getApp(): Application {
    return this.app;
  }
}
