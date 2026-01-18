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

  constructor(apiKey?: string, apiSecret?: string, testnet?: boolean) {
    this.apiKey = apiKey || env.BINANCE_API_KEY || '';
    this.apiSecret = apiSecret || env.BINANCE_API_SECRET || '';
    this.baseURL = testnet !== false 
      ? 'https://testnet.binancefuture.com' 
      : (env.BINANCE_REST_BASE || 'https://testnet.binancefuture.com');

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-MBX-APIKEY': this.apiKey,
      },
    });

    logger.info('Binance REST client created', { 
      baseURL: this.baseURL, 
      hasApiKey: !!this.apiKey 
    });
  }

  public static getInstance(): BinanceFuturesREST {
    if (!BinanceFuturesREST.instance) {
      BinanceFuturesREST.instance = new BinanceFuturesREST();
    }
    return BinanceFuturesREST.instance;
  }

  public async getServerTime(): Promise<number> {
    try {
      const response = await this.client.get('/fapi/v1/time');
      return (response.data as any).serverTime;
    } catch (error) {
      logger.warn('Failed to get server time, using local time', error as any);
      return Date.now();
    }
  }

  public async getExchangeInfo(symbol: string): Promise<any> {
    try {
      const response = await this.client.get('/fapi/v1/exchangeInfo');
      
      // Log response structure for debugging
      logger.info('Exchange info response structure', { 
        hasData: !!response.data,
        hasSymbols: !!response.data?.symbols,
        symbolsType: Array.isArray(response.data?.symbols) ? 'array' : typeof response.data?.symbols,
        symbolsLength: response.data?.symbols?.length || 0,
        dataKeys: Object.keys(response.data || {})
      });
      
      if (!response.data?.symbols || !Array.isArray(response.data.symbols)) {
        logger.error('Invalid exchangeInfo response', { data: response.data });
        throw new Error('Invalid exchange info response structure');
      }
      
      const symbolInfo = response.data.symbols.find((s: any) => s.symbol === symbol);
      
      if (!symbolInfo) {
        logger.warn(`Symbol ${symbol} not found in exchange info`);
      }
      
      return symbolInfo;
    } catch (error: any) {
      logger.error('Failed to get exchange info', { 
        error: error.message,
        status: error?.response?.status,
        data: error?.response?.data
      });
      throw error;
    }
  }

  public async getMarkPrice(symbol: string): Promise<number> {
    try {
      const response = await this.client.get('/fapi/v1/premiumIndex', {
        params: { symbol }
      });
      return parseFloat(response.data.markPrice);
    } catch (error) {
      logger.error('Failed to get mark price', error);
      throw error;
    }
  }

  private roundQuantity(quantity: number, stepSize: string): number {
    const step = parseFloat(stepSize);
    const precision = stepSize.indexOf('1') - 1;
    const rounded = Math.floor(quantity / step) * step;
    return parseFloat(rounded.toFixed(Math.max(0, precision)));
  }

  private roundPrice(price: number, tickSize: string): number {
    const tick = parseFloat(tickSize);
    const precision = tickSize.indexOf('1') - 1;
    const rounded = Math.round(price / tick) * tick;
    return parseFloat(rounded.toFixed(Math.max(0, precision)));
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
    positionSide?: 'BOTH' | 'LONG' | 'SHORT';
  }): Promise<any> {
    let validatedQuantity = params.quantity;
    let validatedPrice = params.price;
    let validatedStopPrice = params.stopPrice;
    
    try {
      // Get exchange info for filters validation
      const exchangeInfo = await this.getExchangeInfo(params.symbol);
      const lotSizeFilter = exchangeInfo?.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
      const priceFilter = exchangeInfo?.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
      const minNotionalFilter = exchangeInfo?.filters?.find((f: any) => f.filterType === 'MIN_NOTIONAL');
      
      // Validate and round prices first
      if (priceFilter) {
        const { tickSize } = priceFilter;
        
        if (validatedPrice !== undefined) {
          validatedPrice = this.roundPrice(validatedPrice, tickSize);
        }
        
        if (validatedStopPrice !== undefined) {
          validatedStopPrice = this.roundPrice(validatedStopPrice, tickSize);
          logger.info('Stop price rounded', {
            original: params.stopPrice,
            validated: validatedStopPrice,
            tickSize
          });
        }
      }
      
      // Validate quantity
      if (lotSizeFilter) {
        const { minQty, maxQty, stepSize } = lotSizeFilter;
        validatedQuantity = this.roundQuantity(params.quantity, stepSize);
        
        // Check MIN_NOTIONAL (minimum order value in USDT)
        if (minNotionalFilter && params.type === 'MARKET') {
          const minNotional = parseFloat(minNotionalFilter.notional || '100');
          // Get current mark price for accurate notional calculation
          const currentPrice = await this.getMarkPrice(params.symbol);
          const estimatedNotional = validatedQuantity * currentPrice;
          
          if (estimatedNotional < minNotional) {
            // Increase quantity to meet minimum notional
            const requiredQty = minNotional / currentPrice;
            validatedQuantity = this.roundQuantity(requiredQty * 1.05, stepSize); // 5% buffer
            logger.warn(`Quantity increased to meet MIN_NOTIONAL`, { 
              original: params.quantity,
              adjusted: validatedQuantity,
              minNotional,
              currentPrice,
              newNotional: validatedQuantity * currentPrice
            });
          }
        }
        
        // Ensure within min/max bounds
        if (validatedQuantity < parseFloat(minQty)) {
          logger.warn(`Quantity ${validatedQuantity} below minQty ${minQty}, using minQty`);
          validatedQuantity = parseFloat(minQty);
        }
        if (validatedQuantity > parseFloat(maxQty)) {
          logger.warn(`Quantity ${validatedQuantity} above maxQty ${maxQty}, using maxQty`);
          validatedQuantity = parseFloat(maxQty);
        }
        
        logger.info('Quantity validated', { 
          original: params.quantity, 
          validated: validatedQuantity, 
          stepSize,
          minQty,
          maxQty 
        });
      }
    } catch (error) {
      logger.warn('Could not validate with exchange info, using defaults', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        symbol: params.symbol,
        originalQuantity: params.quantity
      });
      
      // Fallback: Use default rules
      const stepSize = '0.001';
      validatedQuantity = this.roundQuantity(params.quantity, stepSize);
      
      // Round prices to 2 decimal places as fallback
      if (validatedPrice !== undefined) {
        validatedPrice = parseFloat(validatedPrice.toFixed(2));
      }
      if (validatedStopPrice !== undefined) {
        validatedStopPrice = parseFloat(validatedStopPrice.toFixed(2));
      }
      
      // Ensure minimum 0.001
      if (validatedQuantity < 0.001) {
        validatedQuantity = 0.001;
      }
      
      logger.info('Using fallback validation', { 
        original: params.quantity,
        validated: validatedQuantity
      });
    }

    const timestamp = await this.getServerTime();
    const orderParams: any = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: validatedQuantity,
      timestamp,
      recvWindow: 10000, // 10 seconds to handle network delays
    };

    // Only add positionSide if explicitly provided (don't default to BOTH)
    // This avoids conflicts with account position mode settings
    if (params.positionSide) {
      orderParams.positionSide = params.positionSide;
    }

    // Add optional params with validated values
    if (validatedPrice !== undefined) orderParams.price = validatedPrice;
    if (validatedStopPrice !== undefined) orderParams.stopPrice = validatedStopPrice;
    if (params.timeInForce) orderParams.timeInForce = params.timeInForce;

    const signature = this.sign(orderParams);

    try {
      const response = await this.client.post('/fapi/v1/order', null, {
        params: { ...orderParams, signature },
      });
      
      logger.info('Order placed', { orderId: response.data.orderId, quantity: validatedQuantity });
      return response.data;
    } catch (error: any) {
      const binanceError = error?.response?.data;
      const errorDetails = {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        binanceError: binanceError,
        binanceMsg: binanceError?.msg || binanceError?.message,
        binanceCode: binanceError?.code,
        message: error?.message,
        params: orderParams,
        config: {
          url: error?.config?.url,
          method: error?.config?.method,
          baseURL: error?.config?.baseURL
        }
      };
      logger.error('Failed to place order', errorDetails);
      
      // Throw a more descriptive error
      const errorMsg = binanceError?.msg || binanceError?.message || error?.message || 'Unknown error';
      throw new Error(`Binance order failed: ${errorMsg}`);
      
      // Log Binance error details if available
      if (error?.response?.data) {
        logger.error('Binance API error response', { 
          code: error.response.data.code,
          msg: error.response.data.msg 
        });
      }
      
      throw error;
    }
  }

  public async getAccountInfo(): Promise<any> {
    const timestamp = await this.getServerTime();
    const params = { timestamp, recvWindow: 10000 };
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

  public async setLeverage(symbol: string, leverage: number): Promise<any> {
    const timestamp = await this.getServerTime();
    const params = { symbol, leverage, timestamp, recvWindow: 10000 };
    const signature = this.sign(params);

    try {
      const response = await this.client.post('/fapi/v1/leverage', null, {
        params: { ...params, signature },
      });
      logger.info('Leverage set', { symbol, leverage });
      return response.data;
    } catch (error: any) {
      const errorDetails = {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        message: error?.message
      };
      logger.error('Failed to set leverage', errorDetails);
      throw error;
    }
  }

  public async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<any> {
    const timestamp = await this.getServerTime();
    const params = { symbol, marginType, timestamp, recvWindow: 10000 };
    const signature = this.sign(params);

    try {
      const response = await this.client.post('/fapi/v1/marginType', null, {
        params: { ...params, signature },
      });
      logger.info('Margin type set', { symbol, marginType });
      return response.data;
    } catch (error: any) {
      // Ignore error if margin type is already set
      if (error?.response?.data?.code === -4046) {
        logger.info('Margin type already set', { symbol, marginType });
        return { success: true };
      }
      const errorDetails = {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        message: error?.message
      };
      logger.error('Failed to set margin type', errorDetails);
      throw error;
    }
  }

  // Add more Binance Futures API methods as needed
}
