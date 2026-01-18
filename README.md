# Crypto Telegram Agent

A sophisticated crypto trading bot that monitors price movements, manages trading goals, and publishes alerts to Telegram channels. Supports both paper and live trading on Binance Futures.

## Features

- **Real-time Price Monitoring**: WebSocket connections to Binance for live price feeds
- **Goal-Based Alerts**: Set price targets and conditions, get notified when triggered
- **Trading Agent**: Automatically open positions based on technical conditions (trend, divergence, RSI, support/resistance)
- **Technical Analysis**: RSI, MACD, support/resistance, divergence detection, trend analysis
- **Telegram Integration**: Automated alerts and trade notifications to your Telegram channel
- **State Machine**: Robust goal lifecycle management (IDLE → WATCHING → TRIGGERED → NOTIFIED)
- **REST API**: Manage goals programmatically
- **Risk Management**: Built-in risk controls and position tracking
- **Paper Trading**: Test strategies without risking capital
- **Rate Limiting**: Anti-spam protection for notifications
- **LLM Integration**: Natural language chat interface powered by Groq/Gemini

## Architecture

```
Agent Core ─┬─ Goal Manager ──→ Goal Evaluator ──→ State Machine
            │
            ├─ Market Data ──→ Binance WS ──→ Price Cache
            │
            ├─ Telegram Bot ──→ Channel Publisher
            │
            └─ REST API ──→ Express Server
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL or SQLite
- Binance API keys (for live trading)
- Telegram Bot Token

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### Supabase (Free Hosted PostgreSQL)

1) Create a Supabase project and copy the database connection string from **Project Settings → Database → Connection string**.
2) Set `DATABASE_URL` to the Supabase URL (add `?sslmode=require` if not already present).
3) Create tables on Supabase:

```bash
npm run migrate
```

4) Copy your existing data into Supabase (works from either SQLite or Postgres as the source):

```bash
# SOURCE_DATABASE_URL can be your local Postgres URL or sqlite:./data/crypto_agent.db
SOURCE_DATABASE_URL="..." TARGET_DATABASE_URL="..." npm run transfer
```

PowerShell:
```powershell
$env:SOURCE_DATABASE_URL="..."
$env:TARGET_DATABASE_URL="..."
npm run transfer
```

### Environment Variables

See [.env.example](.env.example) for all required configuration.

## API Endpoints

### Health Check
```
GET /health
```

### Goals Management
```
POST   /goals          # Create new goal
GET    /goals          # List all goals
DELETE /goals/:id      # Delete goal
```

### Webhook (Optional)
```
POST   /webhooks/tv    # TradingView webhook receiver
```

## Trading Agent

The trading agent allows automated position opening based on technical conditions.

**See [TRADING_AGENT.md](TRADING_AGENT.md) for complete guide.**

Quick example:
```
1. Enable trading agent
2. Check trend and resistance
3. "if near resistance with bearish divergence and overbought RSI, open short"
4. Position opens automatically if all conditions met
```

## Goal Structure

```typescript
{
  "symbol": "BTCUSDT",
  "condition": "ABOVE",
  "targetPrice": 50000,
  "watchMode": "CONTINUOUS",
  "notifyChannel": true,
  "autoTrade": false
}
```

## Development

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f app
```

## Project Structure

See [STRUCTURE.md](STRUCTURE.md) for detailed file organization.

## Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test goal_evaluator

# Run with coverage
npm run test:coverage
```

## Telegram Commands

(Optional: if you enable Telegram command handler)

- `/watch BTCUSDT 50000` - Set price watch
- `/list` - List active goals
- `/stop <goal_id>` - Stop watching goal

## Safety & Risk

- Always test with paper trading first
- Start with small position sizes
- Set stop losses on all trades
- Monitor the bot regularly
- Keep API keys secure

## License

MIT

## Support

For issues and questions, please open a GitHub issue.
