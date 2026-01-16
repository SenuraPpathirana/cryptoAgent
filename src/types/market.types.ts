// Binance WebSocket message types

export interface BinanceWSMessage {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
}

// Book ticker (best bid/ask)
export interface BookTickerMessage extends BinanceWSMessage {
  e: 'bookTicker';
  u: number; // Update ID
  b: string; // Best bid price
  B: string; // Best bid qty
  a: string; // Best ask price
  A: string; // Best ask qty
}

// Mark price & funding rate
export interface MarkPriceMessage extends BinanceWSMessage {
  e: 'markPriceUpdate';
  p: string; // Mark price
  i: string; // Index price
  P: string; // Estimated settle price
  r: string; // Funding rate
  T: number; // Next funding time
}

// Kline/Candlestick
export interface KlineMessage extends BinanceWSMessage {
  e: 'kline';
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    f: number; // First trade ID
    L: number; // Last trade ID
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    n: number; // Number of trades
    x: boolean; // Is this kline closed?
    q: string; // Quote asset volume
    V: string; // Taker buy base asset volume
    Q: string; // Taker buy quote asset volume
  };
}

// Aggregated trade
export interface AggTradeMessage extends BinanceWSMessage {
  e: 'aggTrade';
  a: number; // Aggregate trade ID
  p: string; // Price
  q: string; // Quantity
  f: number; // First trade ID
  l: number; // Last trade ID
  T: number; // Trade time
  m: boolean; // Is buyer market maker?
}

// Price data structure
export interface PriceData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  mark?: number;
  timestamp: number;
}

// WebSocket stream configuration
export interface StreamConfig {
  symbol: string;
  streams: StreamType[];
}

export type StreamType = 
  | 'bookTicker'
  | 'markPrice'
  | 'kline_1m'
  | 'kline_5m'
  | 'kline_15m'
  | 'aggTrade';

// Combined stream message
export interface CombinedStreamMessage {
  stream: string;
  data: BinanceWSMessage;
}
