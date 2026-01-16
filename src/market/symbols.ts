import { createModuleLogger } from '../config/logger';
import { SUPPORTED_SYMBOLS } from '../config/constants';

const logger = createModuleLogger('Symbols');

/**
 * Normalize symbol format
 * Converts various formats to Binance format (e.g., BTCUSDT)
 */
export function normalizeSymbol(symbol: string): string {
  // Remove spaces, hyphens, underscores
  let normalized = symbol.toUpperCase().replace(/[\s\-_]/g, '');

  // Handle common variations
  const variations: Record<string, string> = {
    'BTC/USDT': 'BTCUSDT',
    'BTC-USDT': 'BTCUSDT',
    'BTC_USDT': 'BTCUSDT',
    'ETH/USDT': 'ETHUSDT',
    'ETH-USDT': 'ETHUSDT',
    'ETH_USDT': 'ETHUSDT',
  };

  if (variations[symbol.toUpperCase()]) {
    normalized = variations[symbol.toUpperCase()];
  }

  // Ensure USDT suffix if not present
  if (!normalized.endsWith('USDT') && !normalized.endsWith('BUSD')) {
    if (normalized === 'BTC' || normalized === 'BITCOIN') {
      normalized = 'BTCUSDT';
    } else if (normalized === 'ETH' || normalized === 'ETHEREUM') {
      normalized = 'ETHUSDT';
    } else if (normalized.length <= 5) {
      // Assume it's just the base asset
      normalized = `${normalized}USDT`;
    }
  }

  return normalized;
}

/**
 * Validate if symbol is supported
 */
export function isSymbolSupported(symbol: string): boolean {
  const normalized = normalizeSymbol(symbol);
  return SUPPORTED_SYMBOLS.includes(normalized as any);
}

/**
 * Get WebSocket stream name for a symbol
 */
export function getBookTickerStream(symbol: string): string {
  return `${symbol.toLowerCase()}@bookTicker`;
}

export function getMarkPriceStream(symbol: string): string {
  return `${symbol.toLowerCase()}@markPrice`;
}

export function getKlineStream(symbol: string, interval: string = '1m'): string {
  return `${symbol.toLowerCase()}@kline_${interval}`;
}

export function getAggTradeStream(symbol: string): string {
  return `${symbol.toLowerCase()}@aggTrade`;
}

/**
 * Get all streams for a symbol
 */
export function getSymbolStreams(symbol: string): string[] {
  return [
    getBookTickerStream(symbol),
    getMarkPriceStream(symbol),
    getKlineStream(symbol, '1m'),
  ];
}

/**
 * Get streams for multiple symbols
 */
export function getMultiSymbolStreams(symbols: string[]): string[] {
  const streams: string[] = [];
  
  symbols.forEach(symbol => {
    streams.push(...getSymbolStreams(symbol));
  });

  return streams;
}

/**
 * Parse symbol from stream name
 */
export function parseSymbolFromStream(stream: string): string | null {
  const match = stream.match(/^([a-z]+)@/);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Get base and quote assets from symbol
 */
export function parseSymbol(symbol: string): {
  base: string;
  quote: string;
} | null {
  const normalized = normalizeSymbol(symbol);

  // Common quote assets
  const quoteAssets = ['USDT', 'BUSD', 'USDC', 'BTC', 'ETH', 'BNB'];

  for (const quote of quoteAssets) {
    if (normalized.endsWith(quote)) {
      const base = normalized.slice(0, -quote.length);
      return { base, quote };
    }
  }

  logger.warn(`Could not parse symbol: ${symbol}`);
  return null;
}

/**
 * Format price based on symbol
 */
export function formatPrice(symbol: string, price: number): string {
  const parsed = parseSymbol(symbol);
  
  if (!parsed) {
    return price.toFixed(2);
  }

  // BTC pairs: more decimals
  if (parsed.base === 'BTC' || parsed.quote === 'BTC') {
    return price.toFixed(8);
  }

  // High-value assets: 2 decimals
  if (['BTC', 'ETH', 'BNB'].includes(parsed.base)) {
    return price.toFixed(2);
  }

  // Low-value assets: more decimals
  if (price < 1) {
    return price.toFixed(6);
  } else if (price < 100) {
    return price.toFixed(4);
  } else {
    return price.toFixed(2);
  }
}
