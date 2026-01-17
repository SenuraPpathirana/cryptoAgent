import { GOAL_STATES, PRICE_CONDITIONS, WATCH_MODES } from '../config/constants';

// Goal state type
export type GoalState = typeof GOAL_STATES[keyof typeof GOAL_STATES];

// Price condition type
export type PriceCondition = typeof PRICE_CONDITIONS[keyof typeof PRICE_CONDITIONS];

// Watch mode type
export type WatchMode = typeof WATCH_MODES[keyof typeof WATCH_MODES];

// Base Goal interface
export interface Goal {
  id: string;
  userId: number;
  symbol: string;
  condition: PriceCondition;
  targetPrice: number;
  currentPrice?: number;
  state: GoalState;
  watchMode: WatchMode;
  notifyChannel: boolean;
  autoTrade: boolean;
  
  // Trade parameters (optional)
  tradeConfig?: TradeConfig;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  triggeredAt?: Date;
  notifiedAt?: Date;
  completedAt?: Date;
  
  // Trigger count for recurring goals
  triggerCount: number;
  maxTriggers?: number;
  
  // Cooldown between triggers (for recurring goals)
  cooldownMinutes?: number;
  lastTriggerAt?: Date;
}

// Trade configuration
export interface TradeConfig {
  side: 'LONG' | 'SHORT';
  positionSizeUsdt: number;
  leverage: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  trailingStop?: boolean;
}

// Create goal DTO
export interface CreateGoalDto {
  symbol: string;
  condition: PriceCondition;
  targetPrice: number;
  watchMode?: WatchMode;
  notifyChannel?: boolean;
  autoTrade?: boolean;
  tradeConfig?: TradeConfig;
  maxTriggers?: number;
  cooldownMinutes?: number;
}

// Update goal DTO
export interface UpdateGoalDto {
  targetPrice?: number;
  watchMode?: WatchMode;
  notifyChannel?: boolean;
  autoTrade?: boolean;
  tradeConfig?: TradeConfig;
  state?: GoalState;
  maxTriggers?: number;
  cooldownMinutes?: number;
}

// Goal filter
export interface GoalFilter {
  userId?: number;
  status?: string;
  symbol?: string;
  state?: GoalState;
}

// Goal evaluation result
export interface GoalEvaluationResult {
  goalId: string;
  triggered: boolean;
  previousState: GoalState;
  newState: GoalState;
  reason?: string;
  timestamp: Date;
}
