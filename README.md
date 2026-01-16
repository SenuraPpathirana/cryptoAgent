# Crypto Telegram Agent

A sophisticated crypto trading bot that monitors price movements, manages trading goals, and publishes alerts to Telegram channels. Supports both paper and live trading on Binance Futures.

## Features

- **Real-time Price Monitoring**: WebSocket connections to Binance for live price feeds
- **Goal-Based Alerts**: Set price targets and conditions, get notified when triggered
- **Telegram Integration**: Automated alerts and trade notifications to your Telegram channel
- **State Machine**: Robust goal lifecycle management (IDLE → WATCHING → TRIGGERED → NOTIFIED)
- **REST API**: Manage goals programmatically
- **Risk Management**: Built-in risk controls and position tracking
- **Paper Trading**: Test strategies without risking capital
- **Rate Limiting**: Anti-spam protection for notifications

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
