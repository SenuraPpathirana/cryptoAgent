import { EVENT_TYPES } from '../config/constants';

// Event type
export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// Base event interface
export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Goal event
export interface GoalEvent extends BaseEvent {
  goalId: string;
  symbol: string;
  targetPrice: number;
  currentPrice?: number;
}

// Alert event
export interface AlertEvent extends GoalEvent {
  type: 'ALERT_SENT' | 'GOAL_TRIGGERED';
  message: string;
  channelId?: string;
  messageId?: number;
}

// Trade event
export interface TradeEvent extends BaseEvent {
  type: 'TRADE_OPENED' | 'TRADE_CLOSED';
  tradeId?: string;
  goalId?: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  leverage: number;
  pnl?: number;
  pnlPercent?: number;
  stopLoss?: number;
  takeProfit?: number;
}

// Error event
export interface ErrorEvent extends BaseEvent {
  type: 'ERROR_OCCURRED';
  error: string;
  stack?: string;
  context?: Record<string, any>;
}

// System event
export interface SystemEvent extends BaseEvent {
  message: string;
  level: 'info' | 'warn' | 'error';
}

// Union type for all events
export type AgentEvent = 
  | GoalEvent 
  | AlertEvent 
  | TradeEvent 
  | ErrorEvent 
  | SystemEvent;
