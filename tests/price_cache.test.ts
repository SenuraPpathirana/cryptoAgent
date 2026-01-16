import { PriceCache } from '../src/market/price_cache';
import { PriceData } from '../src/types/market.types';

describe('PriceCache', () => {
  let priceCache: PriceCache;

  beforeEach(() => {
    priceCache = PriceCache.getInstance();
    priceCache.clear();
  });

  afterEach(() => {
    priceCache.clear();
  });

  test('should store and retrieve price', () => {
    const priceData: PriceData = {
      symbol: 'BTCUSDT',
      bid: 50000,
      ask: 50010,
      last: 50005,
      timestamp: Date.now(),
    };

    priceCache.updatePrice('BTCUSDT', priceData);

    const retrieved = priceCache.getPrice('BTCUSDT');
    expect(retrieved).toEqual(priceData);
  });

  test('should return undefined for unknown symbol', () => {
    const retrieved = priceCache.getPrice('UNKNOWN');
    expect(retrieved).toBeUndefined();
  });

  test('should maintain price history', () => {
    priceCache.updatePrice('ETHUSDT', {
      symbol: 'ETHUSDT',
      bid: 3000,
      ask: 3000,
      last: 3000,
      timestamp: Date.now(),
    });

    priceCache.updatePrice('ETHUSDT', {
      symbol: 'ETHUSDT',
      bid: 3100,
      ask: 3100,
      last: 3100,
      timestamp: Date.now(),
    });

    const history = priceCache.getPriceHistory('ETHUSDT');
    expect(history.length).toBe(2);
    expect(history[0].last).toBe(3000);
    expect(history[1].last).toBe(3100);
  });

  test('should calculate price change', () => {
    const now = Date.now();

    priceCache.updatePrice('BNBUSDT', {
      symbol: 'BNBUSDT',
      bid: 300,
      ask: 300,
      last: 300,
      timestamp: now - 60000, // 1 minute ago
    });

    priceCache.updatePrice('BNBUSDT', {
      symbol: 'BNBUSDT',
      bid: 315,
      ask: 315,
      last: 315,
      timestamp: now,
    });

    const change = priceCache.getPriceChange('BNBUSDT', 60000);
    expect(change).not.toBeNull();
    expect(change?.change).toBe(15);
    expect(change?.changePercent).toBeCloseTo(5, 1);
  });

  test('should emit price-update event', (done) => {
    priceCache.on('price-update', (data) => {
      expect(data.symbol).toBe('ADAUSDT');
      expect(data.current.last).toBe(0.5);
      done();
    });

    priceCache.updatePrice('ADAUSDT', {
      symbol: 'ADAUSDT',
      bid: 0.5,
      ask: 0.5,
      last: 0.5,
      timestamp: Date.now(),
    });
  });

  test('should get all symbols', () => {
    priceCache.updatePrice('BTCUSDT', {
      symbol: 'BTCUSDT',
      bid: 50000,
      ask: 50000,
      last: 50000,
      timestamp: Date.now(),
    });

    priceCache.updatePrice('ETHUSDT', {
      symbol: 'ETHUSDT',
      bid: 3000,
      ask: 3000,
      last: 3000,
      timestamp: Date.now(),
    });

    const symbols = priceCache.getSymbols();
    expect(symbols).toContain('BTCUSDT');
    expect(symbols).toContain('ETHUSDT');
    expect(symbols.length).toBe(2);
  });
});
