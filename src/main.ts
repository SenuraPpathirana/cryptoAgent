import { createModuleLogger } from './config/logger';
import { env } from './config/env';
import { APIServer } from './api/server';
import { db } from './storage/db';
import { BinanceWebSocket } from './market/binance_ws';
import { GoalEvaluator } from './agent/goal_evaluator';
import { GoalManager } from './agent/goal_manager';
import { TelegramBotClient } from './telegram/telegram_bot';
import { ChannelPublisher } from './telegram/channel_publisher';
import { getMultiSymbolStreams } from './market/symbols';
import { SUPPORTED_SYMBOLS } from './config/constants';

const logger = createModuleLogger('Main');

class CryptoTelegramAgent {
  private apiServer: APIServer;
  private binanceWS: BinanceWebSocket;
  private goalEvaluator: GoalEvaluator;
  private telegramBot: TelegramBotClient;
  private channelPublisher: ChannelPublisher;

  constructor() {
    this.apiServer = new APIServer();
    this.binanceWS = BinanceWebSocket.getInstance();
    this.goalEvaluator = GoalEvaluator.getInstance();
    this.telegramBot = TelegramBotClient.getInstance();
    this.channelPublisher = ChannelPublisher.getInstance();
  }

  public async start(): Promise<void> {
    try {
      logger.info('🚀 Starting Crypto Telegram Agent...');
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`Trading Mode: ${env.TRADING_MODE}`);

      // 1. Connect to database
      await db.connect();
      await GoalManager.getInstance().init();

      // 2. Start API server
      await this.apiServer.start();

      // 3. Connect to Binance WebSocket
      const streams = getMultiSymbolStreams(SUPPORTED_SYMBOLS);
      this.binanceWS.connect(streams);

      // 4. Start goal evaluator
      this.goalEvaluator.start();

      // 5. Send startup notification
      await this.channelPublisher.publishCustomMessage(
        `✅ *Crypto Telegram Agent Started*\n\nMode: ${env.TRADING_MODE.toUpperCase()}\nEnvironment: ${env.NODE_ENV}`
      );

      logger.info('✅ All services started successfully');

      // Handle graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('Failed to start application', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      try {
        // Stop goal evaluator
        this.goalEvaluator.stop();

        // Disconnect WebSocket
        this.binanceWS.disconnect();

        // Disconnect database
        await this.database.disconnect();

        // Send shutdown notification
        await this.channelPublisher.publishCustomMessage(
          `🛑 *Crypto Telegram Agent Stopped*\n\nReason: ${signal}`
        );

        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }
}

// Start the application
const app = new CryptoTelegramAgent();
app.start();
