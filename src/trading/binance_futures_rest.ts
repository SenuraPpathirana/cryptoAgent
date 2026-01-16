import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';

const logger = createModuleLogger('BinanceFuturesREST');

export class BinanceFuturesREST {
  private static instance: BinanceFuturesREST;
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private baseURL: string;

  private constructor() {
    this.apiKey = env.BINANCE_API_KEY || '';
    this.apiSecret = env.BINANCE_API_SECRET || '';
    this.baseURL = env.BINANCE_TESTNET 
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-MBX-APIKEY': this.apiKey,
      },
    });
  }

  public static getInstance(): BinanceFuturesREST {
    if (!BinanceFuturesREST.instance) {
      BinanceFuturesREST.instance = new BinanceFuturesREST();
    }
    return BinanceFuturesREST.instance;
  }

  private sign(params: Record<string, any>): string {
    const query = Object.keys(params)
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(query)
      .digest('hex');
  }

  public async placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: string;
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: string;
  }): Promise<any> {
    const timestamp = Date.now();
    const orderParams = {
      ...params,
      timestamp,
    };

    const signature = this.sign(orderParams);

    try {
      const response = await this.client.post('/fapi/v1/order', null, {
        params: { ...orderParams, signature },
      });
      
      logger.info('Order placed', { orderId: response.data.orderId });
      return response.data;
    } catch (error) {
      logger.error('Failed to place order', error);
      throw error;
    }
  }

  public async getAccountInfo(): Promise<any> {
    const timestamp = Date.now();
    const params = { timestamp };
    const signature = this.sign(params);

    try {
      const response = await this.client.get('/fapi/v2/account', {
        params: { ...params, signature },
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to get account info', error);
      throw error;
    }
  }

  // Add more Binance Futures API methods as needed
}
