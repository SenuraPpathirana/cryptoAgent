/**
 * Application constants and default values
 */

// Supported trading symbols
export const SUPPORTED_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'ADAUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'DOTUSDT',
  'MATICUSDT',
  'AVAXUSDT',
] as const;

export type SupportedSymbol = typeof SUPPORTED_SYMBOLS[number];

// Price check intervals
export const PRICE_CHECK_INTERVAL_MS = 1000; // 1 second
export const GOAL_EVALUATION_INTERVAL_MS = 2000; // 2 seconds
export const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

// WebSocket configuration
export const WS_PING_INTERVAL_MS = 30000; // 30 seconds
export const WS_PONG_TIMEOUT_MS = 10000; // 10 seconds
export const WS_RECONNECT_DELAY_MS = 5000; // 5 seconds
export const WS_MAX_RECONNECT_ATTEMPTS = 10;

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const MAX_ALERTS_PER_WINDOW = 20;
export const ALERT_DEBOUNCE_MS = 5000; // 5 seconds

// Trading defaults
export const DEFAULT_STOP_LOSS_PERCENT = 2; // 2%
export const DEFAULT_TAKE_PROFIT_PERCENT = 5; // 5%
export const MIN_POSITION_SIZE_USDT = 10;
export const MAX_POSITION_SIZE_USDT = 1000;

// Binance API limits
export const BINANCE_API_RATE_LIMIT = 1200; // requests per minute
export const BINANCE_ORDER_RATE_LIMIT = 50; // orders per 10 seconds

// Database
export const DB_CONNECTION_TIMEOUT_MS = 5000;
export const DB_QUERY_TIMEOUT_MS = 30000;

// Telegram
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
export const TELEGRAM_RETRY_ATTEMPTS = 3;
export const TELEGRAM_RETRY_DELAY_MS = 1000;

// Goal states
export const GOAL_STATES = {
  IDLE: 'IDLE',
  WATCHING: 'WATCHING',
  TRIGGERED: 'TRIGGERED',
  NOTIFIED: 'NOTIFIED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ERROR: 'ERROR',
} as const;

// Price condition types
export const PRICE_CONDITIONS = {
  ABOVE: 'ABOVE',
  BELOW: 'BELOW',
  CROSSES_ABOVE: 'CROSSES_ABOVE',
  CROSSES_BELOW: 'CROSSES_BELOW',
  BULLISH_DIVERGENCE: 'BULLISH_DIVERGENCE',
  BEARISH_DIVERGENCE: 'BEARISH_DIVERGENCE',
  ANY_DIVERGENCE: 'ANY_DIVERGENCE',
} as const;

// Watch modes
export const WATCH_MODES = {
  ONCE: 'ONCE', // Trigger once and stop
  CONTINUOUS: 'CONTINUOUS', // Keep watching after trigger
  RECURRING: 'RECURRING', // Reset after cooldown
} as const;

// Event types
export const EVENT_TYPES = {
  GOAL_CREATED: 'GOAL_CREATED',
  GOAL_TRIGGERED: 'GOAL_TRIGGERED',
  GOAL_COMPLETED: 'GOAL_COMPLETED',
  GOAL_CANCELLED: 'GOAL_CANCELLED',
  ALERT_SENT: 'ALERT_SENT',
  TRADE_OPENED: 'TRADE_OPENED',
  TRADE_CLOSED: 'TRADE_CLOSED',
  ERROR_OCCURRED: 'ERROR_OCCURRED',
} as const;

// Time constants
export const MILLISECONDS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;

// Utility calculations
export const msToSeconds = (ms: number) => ms / MILLISECONDS_PER_SECOND;
export const secondsToMs = (seconds: number) => seconds * MILLISECONDS_PER_SECOND;
export const minutesToMs = (minutes: number) => minutes * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
