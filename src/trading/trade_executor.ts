import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';
import { BinanceFuturesREST } from './binance_futures_rest';

const logger = createModuleLogger('TradeExecutor');

export interface TradeResult {
  success: boolean;
  tradeId?: string;
  orderId?: string;
  error?: string;
  side: 'LONG' | 'SHORT';
  symbol: string;
  entryPrice?: number;
  quantity?: number;
  leverage?: number;
}

export class TradeExecutor {
  private static instance: TradeExecutor;
  private isPaper: boolean;
  private binance: BinanceFuturesREST;

  private constructor() {
    this.isPaper = env.TRADING_MODE === 'paper';
    this.binance = BinanceFuturesREST.getInstance();
    const mode = env.TRADING_MODE === 'paper' ? 'PAPER (memory only)' : 
                 env.TRADING_MODE === 'testnet' ? 'TESTNET (Binance mock)' : 'LIVE (real money)';
    logger.info(`Trade executor initialized in ${mode} mode`);
  }

  public static getInstance(): TradeExecutor {
    if (!TradeExecutor.instance) {
      TradeExecutor.instance = new TradeExecutor();
    }
    return TradeExecutor.instance;
  }

  public async executeTrade(params: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    quantity: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<TradeResult> {
    logger.info('Executing trade', params);

    if (this.isPaper) {
      return this.executePaperTrade(params);
    }

    try {
      // Set margin type (ignore error if already set)
      try {
        await this.binance.setMarginType(params.symbol, 'ISOLATED');
      } catch (marginError) {
        logger.warn('Could not set margin type, continuing', { error: marginError });
      }
      
      // Set leverage
      await this.binance.setLeverage(params.symbol, params.leverage);
      
      // Place market order
      const orderSide = params.side === 'LONG' ? 'BUY' : 'SELL';
      const order = await this.binance.placeOrder({
        symbol: params.symbol,
        side: orderSide,
        type: 'MARKET',
        quantity: params.quantity,
      });

      logger.info(`Live trade executed: ${order.orderId}`, { order });
      
      // Place stop loss and take profit orders if specified
      if (params.stopLoss) {
        await this.binance.placeOrder({
          symbol: params.symbol,
          side: params.side === 'LONG' ? 'SELL' : 'BUY',
          type: 'STOP_MARKET',
          quantity: params.quantity,
          stopPrice: params.stopLoss,
        });
      }
      
      if (params.takeProfit) {
        await this.binance.placeOrder({
          symbol: params.symbol,
          side: params.side === 'LONG' ? 'SELL' : 'BUY',
          type: 'TAKE_PROFIT_MARKET',
          quantity: params.quantity,
          stopPrice: params.takeProfit,
        });
      }

      return {
        success: true,
        tradeId: `LIVE_${order.orderId}`,
        orderId: order.orderId,
        side: params.side,
        symbol: params.symbol,
        entryPrice: order.avgPrice || order.price,
        quantity: params.quantity,
        leverage: params.leverage,
      };
    } catch (error) {
      logger.error('Live trading failed', { error });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        side: params.side,
        symbol: params.symbol,
      };
    }
  }

  private async executePaperTrade(params: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    quantity: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<TradeResult> {
    // Simulate paper trade
    const tradeId = `PAPER_${Date.now()}`;
    
    logger.info(`Paper trade executed: ${tradeId}`, params);
    
    return {
      success: true,
      tradeId,
      side: params.side,
      symbol: params.symbol,
      quantity: params.quantity,
      leverage: params.leverage,
    };
  }

  public isPaperMode(): boolean {
    return this.isPaper;
  }
}
