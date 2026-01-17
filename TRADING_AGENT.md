# Trading Agent Feature

## Overview

The trading agent allows you to automatically open positions based on technical analysis conditions.

## How to Use

### 1. Enable Trading Agent

```
enable trading agent
```

or

```
turn on trading agent
```

### 2. Open Positions with Conditions

The agent can open positions based on multiple conditions:

#### Example Commands

**Simple Position:**
```
open short position on BTC
```

**With Leverage:**
```
open long with 20x leverage
```

**Conditional Position (with trend + resistance/support + divergence + RSI):**
```
if near resistance with bearish divergence and overbought RSI, open short position
```

```
open long if trend is up and near support
```

```
if downtrend and near resistance, open short
```

### 3. Workflow Example

1. **Check the trend:**
   ```
   what's the trend?
   ```
   Agent: "Downtrend"

2. **Check resistance:**
   ```
   any resistance?
   ```
   Agent shows: "$95,737 (nearest)"

3. **Open conditional position:**
   ```
   if near resistance and bearish divergence with overbought RSI, open short position
   ```

4. **Agent checks all conditions:**
   - ✅ Near resistance ($95,737)
   - ✅ Bearish divergence confirmed
   - ✅ RSI overbought (75.2)
   - ✅ Trend DOWNTREND

5. **Position opened - Telegram notification sent:**
   ```
   ━━━━━━━━━━━━━━━━━━
   ✅ POSITION OPENED
   ━━━━━━━━━━━━━━━━━━

   Symbol: BTCUSDT
   Side: SHORT
   Entry: $95,500
   Leverage: 10x
   Size: $100

   Stop Loss: $97,410
   Take Profit: $90,725

   Conditions Met:
   ✅ Near resistance ($95,737)
   ✅ BEARISH divergence confirmed
   ✅ RSI overbought (75.2)
   ✅ Trend DOWNTREND

   Trade ID: PAPER_1737045678901

   ⚠️ PAPER TRADING MODE
   ━━━━━━━━━━━━━━━━━━
   ```

## Supported Conditions

### Position Sides
- **LONG**: Buy position (profit when price goes up)
- **SHORT**: Sell position (profit when price goes down)

### Conditions
- **requireTrend**: Check if trend matches (up/down)
- **requireLevel**: Check if price is near resistance (for SHORT) or support (for LONG)
- **requireDivergence**: Check for bullish/bearish divergence
- **requireRSI**: Check if RSI is overbought (for SHORT) or oversold (for LONG)

### Parameters
- **leverage**: 1-125x (default: 10x)
- **positionSize**: USDT amount (default: $100)
- **stopLoss**: Percentage (default: 2%)
- **takeProfit**: Percentage (default: 5%)

## Trading Modes

### Paper Trading (Default)
- Simulates trades without real money
- Safe for testing strategies
- Marked with "⚠️ PAPER TRADING MODE"

### Live Trading
Set `TRADING_MODE=live` in `.env` and configure Binance API keys:
```env
TRADING_MODE=live
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
BINANCE_TESTNET=false
```

## Safety Features

1. **Trading agent must be enabled** - Prevents accidental trades
2. **All conditions checked** - Position only opens if ALL specified conditions are met
3. **Telegram notifications** - Instant alerts when positions open
4. **Stop loss & take profit** - Automatic risk management

## Disable Trading Agent

```
turn off trading agent
```

or

```
disable trading agent
```

## Tips

1. Always check technical analysis first before opening positions
2. Use multiple conditions for better entries
3. Start with paper trading to test your strategy
4. Monitor Telegram for position notifications
5. Combine trend + support/resistance + divergence + RSI for high-probability setups
