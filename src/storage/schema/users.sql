-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

-- User configurations (Telegram, Binance, etc.)
CREATE TABLE IF NOT EXISTS user_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  telegram_bot_token TEXT,
  telegram_channel_id TEXT,
  binance_api_key TEXT,
  binance_api_secret TEXT,
  binance_testnet INTEGER DEFAULT 1,
  trading_mode TEXT DEFAULT 'paper', -- paper, testnet, live
  default_leverage INTEGER DEFAULT 10,
  max_position_size_usdt INTEGER DEFAULT 100,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id)
);

-- User behavior tracking (for AI learning)
CREATE TABLE IF NOT EXISTS user_behavior (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  category TEXT, -- 'action', 'symbol', 'feature', 'intent'
  occurrence_count INTEGER DEFAULT 1,
  last_occurred TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, keyword, category)
);

-- Chat messages history
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  message TEXT NOT NULL,
  intent TEXT, -- Store parsed intent as JSON string
  metadata TEXT, -- Additional context as JSON string
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_configs_user_id ON user_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_user_id ON user_behavior(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_keyword ON user_behavior(keyword);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
