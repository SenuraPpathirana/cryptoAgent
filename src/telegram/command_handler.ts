import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { GoalManager } from '../agent/goal_manager.js';
import { PriceCache } from '../market/price_cache.js';
import * as Tpl from './templates.js';

type CommandCallback = (chatId: number, args: string[]) => Promise<void>;

export class TelegramCommandHandler {
  private token = env.TELEGRAM_BOT_TOKEN;
  private offset = 0;
  private polling = false;
  private commands = new Map<string, CommandCallback>();

  constructor(
    private goals: GoalManager,
    private prices: PriceCache
  ) {
    this.registerCommands();
  }

  private registerCommands() {
    this.commands.set('/start', this.handleStart.bind(this));
    this.commands.set('/help', this.handleHelp.bind(this));
    this.commands.set('/watch', this.handleWatch.bind(this));
    this.commands.set('/list', this.handleList.bind(this));
    this.commands.set('/stop', this.handleStop.bind(this));
    this.commands.set('/price', this.handlePrice.bind(this));
  }

  start() {
    this.polling = true;
    this.poll();
    logger.info('Telegram command handler started');
  }

  stop() {
    this.polling = false;
    logger.info('Telegram command handler stopped');
  }

  private async poll() {
    if (!this.polling) return;

    try {
      const updates = await this.getUpdates();
      
      for (const update of updates) {
        if (update.message?.text) {
          await this.handleMessage(update.message);
        }
        this.offset = update.update_id + 1;
      }
    } catch (e) {
      logger.error('Poll error', { e });
    }

    setTimeout(() => this.poll(), 1000);
  }

  private async getUpdates(): Promise<any[]> {
    const url = `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`;
    
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      
      const data = await res.json() as any;
      return data.result || [];
    } catch (e) {
      return [];
    }
  }

  private async handleMessage(message: any) {
    const text = message.text.trim();
    const chatId = message.chat.id;
    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commands.get(command);
    if (handler) {
      try {
        await handler(chatId, args);
      } catch (e) {
        logger.error('Command handler error', { command, e });
        await this.sendMessage(chatId, '❌ Command failed. Try /help');
      }
    }
  }

  private async sendMessage(chatId: number, text: string) {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
  }

  private async handleStart(chatId: number) {
    const msg = `👋 *Welcome to Crypto Alert Bot!*

I monitor crypto prices and alert you when targets are hit.

Use /help to see all commands.`;
    
    await this.sendMessage(chatId, msg);
  }

  private async handleHelp(chatId: number) {
    const msg = `📚 *Available Commands*

/watch <SYMBOL> <PRICE> <CONDITION>
  Watch a price target
  Example: /watch BTCUSDT 50000 GTE

/list
  Show all active goals

/stop <ID>
  Stop watching a goal

/price <SYMBOL>
  Check current price

*Conditions:*
• GTE - Greater than or equal (>=)
• LTE - Less than or equal (<=)
• CROSS_ABOVE - Crosses above target
• CROSS_BELOW - Crosses below target`;

    await this.sendMessage(chatId, msg);
  }

  private async handleWatch(chatId: number, args: string[]) {
    if (args.length < 3) {
      await this.sendMessage(chatId, '❌ Usage: /watch BTCUSDT 50000 GTE');
      return;
    }

    const [symbol, priceStr, condition] = args;
    const target = parseFloat(priceStr);

    if (!['GTE', 'LTE', 'CROSS_ABOVE', 'CROSS_BELOW'].includes(condition.toUpperCase())) {
      await this.sendMessage(chatId, '❌ Invalid condition. Use: GTE, LTE, CROSS_ABOVE, or CROSS_BELOW');
      return;
    }

    if (isNaN(target) || target <= 0) {
      await this.sendMessage(chatId, '❌ Invalid price');
      return;
    }

    try {
      const goal = await this.goals.createGoal({
        symbol: symbol.toUpperCase(),
        condition: condition.toUpperCase() as any,
        targetPrice: target,
        watchMode: 'ONCE',
        notifyChannel: true
      });

      const msg = `✅ *Goal Created*

${Tpl.formatWatchStarted(goal)}

I'll notify when the condition is met!`;

      await this.sendMessage(chatId, msg);
    } catch (e) {
      logger.error('Failed to create goal', { e });
      await this.sendMessage(chatId, '❌ Failed to create goal');
    }
  }

  private async handleList(chatId: number) {
    const goals = (await this.goals.listGoals()).filter(g => g.state === 'WATCHING' || g.state === 'TRIGGERED');

    if (goals.length === 0) {
      await this.sendMessage(chatId, '📭 No active goals');
      return;
    }

    let msg = `📋 *Active Goals* (${goals.length})\n\n`;

    for (const g of goals) {
      msg += `• *${g.symbol}* ${g.condition} ${g.targetPrice.toFixed(2)}\n`;
      msg += `  ID: \`${g.id}\`\n`;
      msg += `  State: ${g.state}\n\n`;
    }

    await this.sendMessage(chatId, msg);
  }

  private async handleStop(chatId: number, args: string[]) {
    if (args.length === 0) {
      await this.sendMessage(chatId, '❌ Usage: /stop <goal_id>');
      return;
    }

    const goalId = args[0];
    const goal = await this.goals.getGoal(goalId);

    if (!goal) {
      await this.sendMessage(chatId, `❌ Goal not found: \`${goalId}\``);
      return;
    }

    await this.goals.deleteGoal(goalId);
    await this.sendMessage(chatId, `✅ ${Tpl.formatWatchStopped(goal)}`);
  }

  private async handlePrice(chatId: number, args: string[]) {
    if (args.length === 0) {
      await this.sendMessage(chatId, '❌ Usage: /price BTCUSDT');
      return;
    }

    const symbol = args[0].toUpperCase();
    const priceData = this.prices.getPrice(symbol);

    if (!priceData) {
      await this.sendMessage(chatId, `❌ No price data for ${symbol}`);
      return;
    }

    let msg = `💰 *${symbol}*\n\n`;
    const price = priceData.last || priceData.mark || priceData.bid || 0;
    msg += `Current: ${price.toFixed(2)}\n`;
    if (priceData.bid) msg += `Bid: ${priceData.bid.toFixed(2)}\n`;
    if (priceData.ask) msg += `Ask: ${priceData.ask.toFixed(2)}\n`;
    if (priceData.mark) msg += `Mark: ${priceData.mark.toFixed(2)}\n`;

    await this.sendMessage(chatId, msg);
  }
}
