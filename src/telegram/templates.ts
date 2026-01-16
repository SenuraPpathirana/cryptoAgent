import { Goal } from '../types/goal.types';
import { TradeEvent, SystemEvent } from '../types/events.types';
import { formatPrice } from '../market/symbols';

/**
 * Format goal alert message
 */
export function formatGoalAlert(goal: Goal, currentPrice: number): string {
  const emoji = getConditionEmoji(goal.condition);
  const priceFormatted = formatPrice(goal.symbol, currentPrice);
  const targetFormatted = formatPrice(goal.symbol, goal.targetPrice);

  let message = `${emoji} *PRICE ALERT*\n\n`;
  message += `📊 *Symbol:* ${goal.symbol}\n`;
  message += `🎯 *Target:* ${targetFormatted}\n`;
  message += `💰 *Current:* ${priceFormatted}\n`;
  message += `📈 *Condition:* ${goal.condition}\n`;
  message += `\n⏰ ${new Date().toLocaleString()}`;

  if (goal.autoTrade && goal.tradeConfig) {
    message += `\n\n🤖 *Auto-trade:* ${goal.tradeConfig.side} @ ${goal.tradeConfig.leverage}x`;
  }

  return message;
}

/**
 * Format trade opened message
 */
export function formatTradeOpened(trade: TradeEvent): string {
  const emoji = trade.side === 'LONG' ? '📈' : '📉';
  const entryFormatted = formatPrice(trade.symbol, trade.entryPrice);

  let message = `${emoji} *TRADE OPENED*\n\n`;
  message += `📊 *Symbol:* ${trade.symbol}\n`;
  message += `📍 *Side:* ${trade.side}\n`;
  message += `💰 *Entry:* ${entryFormatted}\n`;
  message += `📊 *Quantity:* ${trade.quantity}\n`;
  message += `⚡ *Leverage:* ${trade.leverage}x\n`;

  if (trade.stopLoss) {
    message += `🛑 *Stop Loss:* ${formatPrice(trade.symbol, trade.stopLoss)}\n`;
  }

  if (trade.takeProfit) {
    message += `🎯 *Take Profit:* ${formatPrice(trade.symbol, trade.takeProfit)}\n`;
  }

  message += `\n⏰ ${new Date(trade.timestamp).toLocaleString()}`;

  return message;
}

/**
 * Format trade closed message
 */
export function formatTradeClosed(trade: TradeEvent): string {
  if (!trade.exitPrice || !trade.pnl || !trade.pnlPercent) {
    return 'Trade closed';
  }

  const isProfit = trade.pnl > 0;
  const emoji = isProfit ? '✅' : '❌';
  const pnlEmoji = isProfit ? '💰' : '💸';

  const entryFormatted = formatPrice(trade.symbol, trade.entryPrice);
  const exitFormatted = formatPrice(trade.symbol, trade.exitPrice);

  let message = `${emoji} *TRADE CLOSED*\n\n`;
  message += `📊 *Symbol:* ${trade.symbol}\n`;
  message += `📍 *Side:* ${trade.side}\n`;
  message += `💰 *Entry:* ${entryFormatted}\n`;
  message += `🚪 *Exit:* ${exitFormatted}\n`;
  message += `📊 *Quantity:* ${trade.quantity}\n`;
  message += `⚡ *Leverage:* ${trade.leverage}x\n`;
  message += `\n${pnlEmoji} *PnL:* ${trade.pnl.toFixed(2)} USDT (${trade.pnlPercent.toFixed(2)}%)\n`;
  message += `\n⏰ ${new Date(trade.timestamp).toLocaleString()}`;

  return message;
}

/**
 * Format system message
 */
export function formatSystemMessage(event: SystemEvent): string {
  const emoji = getSystemEmoji(event.level);
  
  let message = `${emoji} *SYSTEM MESSAGE*\n\n`;
  message += event.message;
  message += `\n\n⏰ ${new Date(event.timestamp).toLocaleString()}`;

  return message;
}

/**
 * Format watch started message
 */
export function formatWatchStarted(goal: Goal): string {
  const emoji = '👀';
  const targetFormatted = formatPrice(goal.symbol, goal.targetPrice);

  let message = `${emoji} *WATCH STARTED*\n\n`;
  message += `📊 *Symbol:* ${goal.symbol}\n`;
  message += `🎯 *Target:* ${targetFormatted}\n`;
  message += `📈 *Condition:* ${goal.condition}\n`;
  message += `🔄 *Mode:* ${goal.watchMode}\n`;

  if (goal.autoTrade) {
    message += `\n🤖 Auto-trading enabled`;
  }

  return message;
}

/**
 * Format watch stopped message
 */
export function formatWatchStopped(goal: Goal): string {
  const emoji = '🛑';

  let message = `${emoji} *WATCH STOPPED*\n\n`;
  message += `📊 *Symbol:* ${goal.symbol}\n`;
  message += `🎯 *Target:* ${formatPrice(goal.symbol, goal.targetPrice)}\n`;
  message += `📈 *Triggers:* ${goal.triggerCount}\n`;

  return message;
}

/**
 * Get emoji for price condition
 */
function getConditionEmoji(condition: string): string {
  const emojis: Record<string, string> = {
    ABOVE: '⬆️',
    BELOW: '⬇️',
    CROSSES_ABOVE: '↗️',
    CROSSES_BELOW: '↘️',
  };
  return emojis[condition] || '📊';
}

/**
 * Get emoji for system level
 */
function getSystemEmoji(level: string): string {
  const emojis: Record<string, string> = {
    info: 'ℹ️',
    warn: '⚠️',
    error: '🚨',
  };
  return emojis[level] || 'ℹ️';
}
