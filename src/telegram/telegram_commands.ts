import { createModuleLogger } from '../config/logger';
import { TelegramBotClient } from './telegram_bot';
import { GoalManager } from '../agent/goal_manager';
import { normalizeSymbol } from '../market/symbols';

const logger = createModuleLogger('TelegramCommands');

/**
 * Telegram bot command handler
 * Optional: enables bot commands in Telegram
 */
export class TelegramCommands {
  private static instance: TelegramCommands;
  private bot: TelegramBotClient;
  private goalManager: GoalManager;

  private constructor() {
    this.bot = TelegramBotClient.getInstance();
    this.goalManager = GoalManager.getInstance();
    this.registerCommands();
  }

  public static getInstance(): TelegramCommands {
    if (!TelegramCommands.instance) {
      TelegramCommands.instance = new TelegramCommands();
    }
    return TelegramCommands.instance;
  }

  private registerCommands(): void {
    const telegramBot = this.bot.getBot();

    // /start command
    telegramBot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.handleStart(chatId);
    });

    // /help command
    telegramBot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      this.handleHelp(chatId);
    });

    // /watch command: /watch BTCUSDT 50000 ABOVE
    telegramBot.onText(/\/watch ([A-Za-z]+) (\d+\.?\d*) ?([A-Z_]+)?/, (msg, match) => {
      const chatId = msg.chat.id;
      if (match) {
        const [, symbol, price, condition] = match;
        this.handleWatch(chatId, symbol, parseFloat(price), condition);
      }
    });

    // /list command
    telegramBot.onText(/\/list/, (msg) => {
      const chatId = msg.chat.id;
      this.handleList(chatId);
    });

    // /stop command: /stop <goal_id>
    telegramBot.onText(/\/stop (.+)/, (msg, match) => {
      const chatId = msg.chat.id;
      if (match) {
        const [, goalId] = match;
        this.handleStop(chatId, goalId);
      }
    });

    logger.info('Telegram commands registered');
  }

  private async handleStart(chatId: number): Promise<void> {
    const message = `
👋 *Welcome to Crypto Telegram Agent!*

I monitor crypto prices and send you alerts when your conditions are met.

Use /help to see available commands.
    `.trim();

    await this.bot.sendMessage(chatId, message);
  }

  private async handleHelp(chatId: number): Promise<void> {
    const message = `
📚 *Available Commands:*

/watch <symbol> <price> [condition]
   Watch a price target
   Example: /watch BTCUSDT 50000 ABOVE

/list
   List all active watches

/stop <goal_id>
   Stop watching a goal

/help
   Show this help message

*Conditions:*
• ABOVE - Alert when price goes above target
• BELOW - Alert when price goes below target
• CROSSES_ABOVE - Alert when price crosses above
• CROSSES_BELOW - Alert when price crosses below

Default: ABOVE
    `.trim();

    await this.bot.sendMessage(chatId, message);
  }

  private async handleWatch(
    chatId: number,
    symbol: string,
    targetPrice: number,
    condition?: string
  ): Promise<void> {
    try {
      const normalizedSymbol = normalizeSymbol(symbol);
      const goalCondition = condition || 'ABOVE';

      const goal = await this.goalManager.createGoal({
        symbol: normalizedSymbol,
        targetPrice,
        condition: goalCondition as any,
        watchMode: 'ONCE',
        notifyChannel: true,
        autoTrade: false,
      });

      const message = `
✅ *Watch created!*

📊 Symbol: ${goal.symbol}
🎯 Target: ${goal.targetPrice}
📈 Condition: ${goal.condition}
🆔 Goal ID: \`${goal.id}\`

I'll notify you when the condition is met!
      `.trim();

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      logger.error('Failed to create watch', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Failed to create watch. Please check your parameters.'
      );
    }
  }

  private async handleList(chatId: number): Promise<void> {
    try {
      const goals = await this.goalManager.getActiveGoals();

      if (goals.length === 0) {
        await this.bot.sendMessage(chatId, '📭 No active watches');
        return;
      }

      let message = '📋 *Active Watches:*\n\n';

      goals.forEach((goal, index) => {
        message += `${index + 1}. ${goal.symbol} ${goal.condition} ${goal.targetPrice}\n`;
        message += `   ID: \`${goal.id}\`\n`;
        message += `   State: ${goal.state}\n`;
        message += `   Triggers: ${goal.triggerCount}\n\n`;
      });

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      logger.error('Failed to list watches', error);
      await this.bot.sendMessage(chatId, '❌ Failed to list watches');
    }
  }

  private async handleStop(chatId: number, goalId: string): Promise<void> {
    try {
      const deleted = await this.goalManager.deleteGoal(goalId.trim());

      if (deleted) {
        await this.bot.sendMessage(
          chatId,
          `✅ Watch stopped: \`${goalId}\``
        );
      } else {
        await this.bot.sendMessage(
          chatId,
          `❌ Watch not found: \`${goalId}\``
        );
      }
    } catch (error) {
      logger.error('Failed to stop watch', error);
      await this.bot.sendMessage(chatId, '❌ Failed to stop watch');
    }
  }
}
