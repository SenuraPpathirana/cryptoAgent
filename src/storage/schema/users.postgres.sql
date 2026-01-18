-- PostgreSQL schema (compatible with Supabase Postgres)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username TEXT,
  created_at TEXT DEFAULT (now()::text),
  updated_at TEXT DEFAULT (now()::text),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS user_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  telegram_bot_token TEXT,
  telegram_channel_id TEXT,
  binance_api_key TEXT,
  binance_api_secret TEXT,
  binance_testnet INTEGER DEFAULT 1,
  trading_mode TEXT DEFAULT 'paper',
  default_leverage INTEGER DEFAULT 10,
  max_position_size_usdt INTEGER DEFAULT 100,
  created_at TEXT DEFAULT (now()::text),
  updated_at TEXT DEFAULT (now()::text),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_behavior (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  category TEXT,
  occurrence_count INTEGER DEFAULT 1,
  action TEXT,
  action_count INTEGER DEFAULT 1,
  last_occurred TEXT DEFAULT (now()::text),
  created_at TEXT DEFAULT (now()::text),
  UNIQUE(user_id, keyword, category),
  UNIQUE(user_id, action)
);

ALTER TABLE user_behavior ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE user_behavior ADD COLUMN IF NOT EXISTS action_count INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  intent TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  condition TEXT NOT NULL,
  target_price DOUBLE PRECISION NOT NULL,
  current_price DOUBLE PRECISION,
  state TEXT NOT NULL,
  watch_mode TEXT NOT NULL,
  notify_channel INTEGER DEFAULT 1,
  auto_trade INTEGER DEFAULT 0,
  trade_config TEXT,
  created_at TEXT DEFAULT (now()::text),
  updated_at TEXT DEFAULT (now()::text),
  triggered_at TEXT,
  notified_at TEXT,
  completed_at TEXT,
  trigger_count INTEGER DEFAULT 0,
  max_triggers INTEGER,
  cooldown_minutes INTEGER,
  last_trigger_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_configs_user_id ON user_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_user_id ON user_behavior(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_keyword ON user_behavior(keyword);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_state ON goals(state);
CREATE INDEX IF NOT EXISTS idx_goals_symbol ON goals(symbol);
