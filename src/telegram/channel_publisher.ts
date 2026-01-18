import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';
import { TelegramBotClient } from './telegram_bot';
import { formatGoalAlert, formatTradeOpened, formatTradeClosed, formatSystemMessage } from './templates';
import { Goal } from '../types/goal.types';
import { TradeEvent, SystemEvent } from '../types/events.types';

const logger = createModuleLogger('ChannelPublisher');

export class ChannelPublisher {
  private static instance: ChannelPublisher;
  private bot: TelegramBotClient;
  private channelId: string;

  private constructor() {
    this.bot = TelegramBotClient.getInstance();
    this.channelId = env.TELEGRAM_CHANNEL_ID || '';
  }

  public static getInstance(): ChannelPublisher {
    if (!ChannelPublisher.instance) {
      ChannelPublisher.instance = new ChannelPublisher();
    }
    return ChannelPublisher.instance;
  }

  public async publishGoalAlert(goal: Goal, currentPrice: number): Promise<boolean> {
    try {
      const message = formatGoalAlert(goal, currentPrice);
      const result = await this.bot.sendMessage(this.channelId, message);
      
      if (result) {
        logger.info(`Goal alert published for ${goal.id}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to publish goal alert', error);
      return false;
    }
  }

  public async publishTradeOpened(trade: TradeEvent): Promise<boolean> {
    try {
      const message = formatTradeOpened(trade);
      const result = await this.bot.sendMessage(this.channelId, message);
      
      if (result) {
        logger.info(`Trade opened alert published: ${trade.tradeId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to publish trade opened', error);
      return false;
    }
  }

  public async publishTradeClosed(trade: TradeEvent): Promise<boolean> {
    try {
      const message = formatTradeClosed(trade);
      const result = await this.bot.sendMessage(this.channelId, message);
      
      if (result) {
        logger.info(`Trade closed alert published: ${trade.tradeId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to publish trade closed', error);
      return false;
    }
  }

  public async publishSystemMessage(event: SystemEvent): Promise<boolean> {
    try {
      const message = formatSystemMessage(event);
      const result = await this.bot.sendMessage(this.channelId, message);
      
      if (result) {
        logger.info('System message published');
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to publish system message', error);
      return false;
    }
  }

  public async publishCustomMessage(message: string): Promise<boolean> {
    try {
      const result = await this.bot.sendMessage(this.channelId, message);
      return !!result;
    } catch (error) {
      logger.error('Failed to publish custom message', error);
      return false;
    }
  }
}
