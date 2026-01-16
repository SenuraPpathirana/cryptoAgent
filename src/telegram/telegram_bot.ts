import TelegramBot from 'node-telegram-bot-api';
import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';
import { TELEGRAM_MAX_MESSAGE_LENGTH, TELEGRAM_RETRY_ATTEMPTS, TELEGRAM_RETRY_DELAY_MS } from '../config/constants';

const logger = createModuleLogger('TelegramBot');

export class TelegramBotClient {
  private static instance: TelegramBotClient;
  private bot: TelegramBot;
  private connected = false;

  private constructor() {
    this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, {
      polling: false, // We'll use webhook or manual polling if needed
    });
    this.initialize();
  }

  public static getInstance(): TelegramBotClient {
    if (!TelegramBotClient.instance) {
      TelegramBotClient.instance = new TelegramBotClient();
    }
    return TelegramBotClient.instance;
  }

  private async initialize(): Promise<void> {
    try {
      const me = await this.bot.getMe();
      this.connected = true;
      logger.info(`Telegram bot connected: @${me.username}`);
    } catch (error) {
      logger.error('Failed to initialize Telegram bot', error);
      this.connected = false;
    }
  }

  public async sendMessage(
    chatId: string | number,
    text: string,
    options?: TelegramBot.SendMessageOptions
  ): Promise<TelegramBot.Message | null> {
    if (!this.connected) {
      logger.error('Telegram bot not connected');
      return null;
    }

    // Split long messages
    if (text.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
      return await this.sendLongMessage(chatId, text, options);
    }

    return await this.sendWithRetry(chatId, text, options);
  }

  private async sendWithRetry(
    chatId: string | number,
    text: string,
    options?: TelegramBot.SendMessageOptions,
    attempt: number = 1
  ): Promise<TelegramBot.Message | null> {
    try {
      const message = await this.bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        ...options,
      });
      logger.info(`Message sent to ${chatId}`);
      return message;
    } catch (error) {
      logger.error(`Failed to send message (attempt ${attempt})`, error);

      if (attempt < TELEGRAM_RETRY_ATTEMPTS) {
        await this.delay(TELEGRAM_RETRY_DELAY_MS * attempt);
        return await this.sendWithRetry(chatId, text, options, attempt + 1);
      }

      return null;
    }
  }

  private async sendLongMessage(
    chatId: string | number,
    text: string,
    options?: TelegramBot.SendMessageOptions
  ): Promise<TelegramBot.Message | null> {
    const chunks = this.splitMessage(text);
    let lastMessage: TelegramBot.Message | null = null;

    for (const chunk of chunks) {
      lastMessage = await this.sendWithRetry(chatId, chunk, options);
      if (!lastMessage) {
        logger.error('Failed to send message chunk');
        break;
      }
      await this.delay(100); // Small delay between chunks
    }

    return lastMessage;
  }

  private splitMessage(text: string): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > TELEGRAM_MAX_MESSAGE_LENGTH) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // If single line is too long, split it
        if (line.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
          for (let i = 0; i < line.length; i += TELEGRAM_MAX_MESSAGE_LENGTH) {
            chunks.push(line.slice(i, i + TELEGRAM_MAX_MESSAGE_LENGTH));
          }
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  public async sendPhoto(
    chatId: string | number,
    photo: string,
    options?: TelegramBot.SendPhotoOptions
  ): Promise<TelegramBot.Message | null> {
    try {
      const message = await this.bot.sendPhoto(chatId, photo, options);
      logger.info(`Photo sent to ${chatId}`);
      return message;
    } catch (error) {
      logger.error('Failed to send photo', error);
      return null;
    }
  }

  public async editMessage(
    chatId: string | number,
    messageId: number,
    text: string,
    options?: TelegramBot.EditMessageTextOptions
  ): Promise<boolean> {
    try {
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        ...options,
      });
      logger.info(`Message ${messageId} edited`);
      return true;
    } catch (error) {
      logger.error('Failed to edit message', error);
      return false;
    }
  }

  public async deleteMessage(chatId: string | number, messageId: number): Promise<boolean> {
    try {
      await this.bot.deleteMessage(chatId, messageId);
      logger.info(`Message ${messageId} deleted`);
      return true;
    } catch (error) {
      logger.error('Failed to delete message', error);
      return false;
    }
  }

  public getBot(): TelegramBot {
    return this.bot;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
