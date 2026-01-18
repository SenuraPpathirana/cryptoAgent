import { createModuleLogger } from '../config/logger';
import { CandleData } from '../analysis/analysis_engine';

const logger = createModuleLogger('BinanceDataFetcher');

export class BinanceDataFetcher {
  private static instance: BinanceDataFetcher;
  private baseUrl = 'https://fapi.binance.com';

  private constructor() {}

  public static getInstance(): BinanceDataFetcher {
    if (!BinanceDataFetcher.instance) {
      BinanceDataFetcher.instance = new BinanceDataFetcher();
    }
    return BinanceDataFetcher.instance;
  }

  /**
   * Fetch historical klines/candles from Binance
   * @param symbol Trading pair (e.g., 'BTCUSDT')
   * @param interval Timeframe ('1m', '5m', '15m', '1h', '4h', '1d')
   * @param limit Number of candles (max 1500, default 200)
   */
  public async getKlines(
    symbol: string,
    interval: string = '1h',
    limit: number = 200
  ): Promise<CandleData[]> {
    try {
      const url = `${this.baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      
      logger.info(`Fetching ${limit} ${interval} candles for ${symbol}`);

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any[];

      // Transform Binance kline format to CandleData
      const candles: CandleData[] = data.map((kline: any[]) => ({
        timestamp: kline[0],           // Open time
        open: parseFloat(kline[1]),     // Open price
        high: parseFloat(kline[2]),     // High price
        low: parseFloat(kline[3]),      // Low price
        close: parseFloat(kline[4]),    // Close price
        volume: parseFloat(kline[5])    // Volume
      }));

      logger.info(`Successfully fetched ${candles.length} candles for ${symbol}`);

      return candles;
    } catch (error) {
      logger.error(`Failed to fetch klines for ${symbol}`, { error });
      throw error;
    }
  }

  /**
   * Get multiple timeframes for comprehensive analysis
   */
  public async getMultiTimeframe(symbol: string): Promise<{
    '1h': CandleData[];
    '4h': CandleData[];
    '1d': CandleData[];
  }> {
    try {
      const [hour1, hour4, day1] = await Promise.all([
        this.getKlines(symbol, '1h', 200),
        this.getKlines(symbol, '4h', 100),
        this.getKlines(symbol, '1d', 100)
      ]);

      return {
        '1h': hour1,
        '4h': hour4,
        '1d': day1
      };
    } catch (error) {
      logger.error(`Failed to fetch multi-timeframe data for ${symbol}`, { error });
      throw error;
    }
  }
}
