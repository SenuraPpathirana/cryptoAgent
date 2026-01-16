import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env file
dotenv.config();

// Environment schema
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Database
  DATABASE_URL: z.string(),

  // Binance
  BINANCE_API_KEY: z.string().optional(),
  BINANCE_API_SECRET: z.string().optional(),
  BINANCE_TESTNET: z.string().transform(val => val === 'true').default('true'),
  BINANCE_WS_URL: z.string().default('wss://fstream.binance.com/ws'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string(),
  TELEGRAM_CHANNEL_ID: z.string(),

  // Trading
  TRADING_MODE: z.enum(['paper', 'live']).default('paper'),
  MAX_POSITION_SIZE_USDT: z.string().transform(Number).default('100'),
  DEFAULT_LEVERAGE: z.string().transform(Number).default('10'),
  REQUIRE_STOP_LOSS: z.string().transform(val => val === 'true').default('true'),

  // Risk Management
  MAX_DAILY_TRADES: z.string().transform(Number).default('20'),
  MAX_OPEN_POSITIONS: z.string().transform(Number).default('5'),
  COOLDOWN_MINUTES: z.string().transform(Number).default('15'),

  // Rate Limiting
  ALERT_COOLDOWN_SECONDS: z.string().transform(Number).default('300'),
  MAX_ALERTS_PER_HOUR: z.string().transform(Number).default('20'),

  // API Security
  API_KEY: z.string().optional(),

  // LLM APIs (for enhanced chat)
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  // Monitoring
  HEALTH_CHECK_INTERVAL_MS: z.string().transform(Number).default('30000'),
  RECONNECT_DELAY_MS: z.string().transform(Number).default('5000'),
});

// Parse and validate
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
};

export const env = parseEnv();

// Type-safe environment variables
export type Env = z.infer<typeof envSchema>;

// Helper: is production?
export const isProduction = () => env.NODE_ENV === 'production';
export const isDevelopment = () => env.NODE_ENV === 'development';
export const isTest = () => env.NODE_ENV === 'test';
