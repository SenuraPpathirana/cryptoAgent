# AI-Powered Chat UI for Crypto Trading Agent 🤖

## Overview
An intelligent chatbot interface that understands natural language commands for crypto trading and price monitoring.

## Features ✨

### 1. **Natural Language Processing**
- Understands conversational commands
- Extracts trading intent automatically
- No need for complex syntax or commands

### 2. **Trading Mode Selection**
- **Paper Mode** (📄): Simulation trading with no real money
- **Live Mode** (🔴): Real trading (when auto-trade enabled)
- Toggle between modes in the header

### 3. **Live Price Ticker**
- Real-time prices from Binance WebSocket
- Updates every 2 seconds
- Displays BTC, ETH, BNB prices

### 4. **Supported Commands**

#### Create Price Alerts
```
"Alert me when BTC hits $50000"
"Watch Bitcoin and notify me when it goes above $45,000"
"Tell me when ETH drops below $3000"
"Alert when Solana crosses above $100"
```

#### Check Prices
```
"What's the current BTC price?"
"How much is ETH?"
"Show me the Bitcoin price"
```

#### List Goals
```
"Show my active goals"
"List all goals"
"What goals do I have?"
```

#### Get Help
```
"help"
"What can you do?"
"How do I use this?"
```

## Natural Language Understanding 🧠

### Supported Cryptocurrencies
- Bitcoin / BTC → BTCUSDT
- Ethereum / ETH → ETHUSDT
- Binance Coin / BNB → BNBUSDT
- Cardano / ADA → ADAUSDT
- Solana / SOL → SOLUSDT
- Ripple / XRP → XRPUSDT

### Price Conditions
- **Above/Over/Higher/Greater/Exceeds/Reaches/Hits** → Price goes ABOVE target
- **Below/Under/Lower/Drops/Falls** → Price goes BELOW target
- **Crosses Above/Breaks Above** → Price crosses above target (transition)
- **Crosses Below/Breaks Below** → Price crosses below target (transition)

### Price Formats
- `$50000` - Dollar sign with number
- `50k` - Thousands (k suffix)
- `50,000` - Comma separated
- `50000.50` - Decimals

## How It Works 🔧

1. **User Input**: Type natural language message
2. **NLP Processing**: AI parses your intent (symbol, condition, target price)
3. **Goal Creation**: System creates trading goal in database
4. **Price Monitoring**: WebSocket monitors live prices
5. **Alert Trigger**: Notifies when conditions are met

## Architecture

```
┌─────────────────┐
│   Chat UI       │ ← User types message
│  (HTML/JS/CSS)  │
└────────┬────────┘
         │
         ↓ POST /api/chat
┌─────────────────┐
│  NLP Processor  │ ← Parses natural language
│ (nlp_processor) │    Extracts: symbol, condition, target
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Goals Repo     │ ← Creates/manages goals
│ (goals.repo)    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Goal Evaluator  │ ← Monitors prices
│ + Price Cache   │    Triggers alerts
└─────────────────┘
```

## API Endpoints

### POST /api/chat
**Request:**
```json
{
  "message": "Alert me when BTC hits $50000",
  "tradingMode": "paper"
}
```

**Response:**
```json
{
  "ok": true,
  "response": "✅ Got it! I'll watch BTCUSDT and alert you when it reaches or exceeds $50,000.",
  "goal": {
    "id": "goal-1234567890-abc",
    "symbol": "BTCUSDT",
    "targetPrice": 50000,
    "condition": "ABOVE",
    "state": "WATCHING",
    "watchMode": "ONCE"
  },
  "intent": {
    "action": "CREATE_GOAL",
    "symbol": "BTCUSDT",
    "condition": "ABOVE",
    "target": 50000,
    "confidence": 1.0
  }
}
```

### WebSocket /ws
Real-time price updates:
```json
{
  "type": "price",
  "prices": {
    "BTCUSDT": 45000,
    "ETHUSDT": 3200,
    "BNBUSDT": 420
  }
}
```

## Trading Modes Explained

### Paper Mode (Default)
- **Purpose**: Test strategies without risk
- **Behavior**: All goals are set to WATCH mode
- **Money**: No real money involved
- **Use Case**: Learning, testing, experimentation

### Live Mode
- **Purpose**: Real trading with actual money ⚠️
- **Behavior**: Auto-trade enabled goals execute real trades
- **Money**: Uses real funds from your account
- **Use Case**: Production trading (use with caution!)

## Example Conversations

### Example 1: Simple Alert
```
User: Alert me when Bitcoin reaches $50,000
Bot: ✅ Got it! I'll watch BTCUSDT and alert you when it reaches or exceeds $50,000.
     [Goal Created]
     BTCUSDT | ABOVE 50000
     Mode: paper | Notify Once: Yes
     ID: goal-1234567890-abc
```

### Example 2: Price Check
```
User: What's the current BTC price?
Bot: 💰 Current BTCUSDT price: $45,234
```

### Example 3: List Goals
```
User: Show my goals
Bot: 📋 You have 2 active goal(s):

     1. BTCUSDT ABOVE $50,000 (🟢 Active)
     2. ETHUSDT BELOW $3,000 (🟢 Active)
```

## Quick Actions
Pre-defined buttons for common tasks:
- 🎯 BTC $50k Alert
- 📋 My Goals
- 💰 BTC Price

Click any button to auto-fill the input.

## Technical Stack

### Frontend
- Pure HTML5/CSS3/JavaScript
- WebSocket for real-time updates
- Responsive design
- Gradient backgrounds and modern UI

### Backend
- TypeScript
- Express.js REST API
- WebSocket Server (ws library)
- Natural Language Processing (custom NLP)

### Data Layer
- PostgreSQL database
- In-memory price cache
- Real-time Binance WebSocket

## Configuration

The chat UI uses the same environment variables as the main app:

```env
PORT=3000                    # HTTP server port
API_KEY=your-api-key        # Optional API protection
TRADING_MODE=paper          # paper or live
```

## Running the Chat UI

1. **Start the Application**
   ```bash
   npm run dev
   ```

2. **Open Browser**
   - Navigate to: http://localhost:3000
   - Chat UI loads automatically

3. **Start Trading**
   - Select trading mode (Paper/Live)
   - Type natural language commands
   - Get instant AI-powered responses

## Future Enhancements 🚀

- [ ] OpenAI/Claude LLM integration for advanced understanding
- [ ] Multi-language support
- [ ] Voice input/output
- [ ] Chart visualizations
- [ ] Trade history timeline
- [ ] Advanced technical analysis commands
- [ ] Portfolio management
- [ ] Custom strategy builder
- [ ] Mobile responsive design improvements
- [ ] Dark mode toggle

## Security Notes 🔒

1. **API Protection**: Chat endpoint is currently public (no x-api-key required)
2. **Live Trading**: Always test in paper mode first
3. **Input Validation**: NLP processor validates all inputs
4. **Rate Limiting**: Consider adding rate limits for production

## Troubleshooting

### Chat Not Connecting
- Check if server is running on port 3000
- Verify WebSocket connection in browser console
- Check firewall settings

### Prices Not Updating
- Verify Binance WebSocket connection
- Check network connectivity
- Look for errors in server logs

### Goals Not Creating
- Check database connection
- Verify goal format in browser network tab
- Check server logs for errors

## Support

For issues or questions:
1. Check server logs: `npm run dev`
2. Check browser console: F12 → Console tab
3. Review [main README](./README.md)

---

**Built with ❤️ for crypto traders who want a conversational experience**
