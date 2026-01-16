import { createModuleLogger } from '../config/logger';
import {
  CombinedStreamMessage,
  BookTickerMessage,
  MarkPriceMessage,
  KlineMessage,
  AggTradeMessage,
} from '../types/market.types';
import { PriceCache } from './price_cache';

const logger = createModuleLogger('StreamRouter');

export class StreamRouter {
  private static instance: StreamRouter;
  private priceCache: PriceCache;

  private constructor() {
    this.priceCache = PriceCache.getInstance();
  }

  public static getInstance(): StreamRouter {
    if (!StreamRouter.instance) {
      StreamRouter.instance = new StreamRouter();
    }
    return StreamRouter.instance;
  }

  public route(message: CombinedStreamMessage): void {
    const { stream, data } = message;

    try {
      if (!data || !data.e) {
        logger.debug('Invalid message format', { stream });
        return;
      }

      switch (data.e) {
        case 'bookTicker':
          this.handleBookTicker(data as BookTickerMessage);
          break;

        case 'markPriceUpdate':
          this.handleMarkPrice(data as MarkPriceMessage);
          break;

        case 'kline':
          this.handleKline(data as KlineMessage);
          break;

        case 'aggTrade':
          this.handleAggTrade(data as AggTradeMessage);
          break;

        default:
          logger.debug(`Unhandled event type: ${data.e}`);
      }
    } catch (error) {
      logger.error('Failed to route message', error, { stream });
    }
  }

  private handleBookTicker(message: BookTickerMessage): void {
    const { s: symbol, b: bid, a: ask } = message;

    this.priceCache.updatePrice(symbol, {
      symbol,
      bid: parseFloat(bid),
      ask: parseFloat(ask),
      last: (parseFloat(bid) + parseFloat(ask)) / 2,
      timestamp: message.E,
    });

    logger.debug(`BookTicker updated: ${symbol}`, {
      bid,
      ask,
    });
  }

  private handleMarkPrice(message: MarkPriceMessage): void {
    const { s: symbol, p: markPrice } = message;

    const existingPrice = this.priceCache.getPrice(symbol);
    if (existingPrice) {
      this.priceCache.updatePrice(symbol, {
        ...existingPrice,
        mark: parseFloat(markPrice),
        timestamp: message.E,
      });
    } else {
      const price = parseFloat(markPrice);
      this.priceCache.updatePrice(symbol, {
        symbol,
        bid: price,
        ask: price,
        last: price,
        mark: price,
        timestamp: message.E,
      });
    }

    logger.debug(`Mark price updated: ${symbol}`, { markPrice });
  }

  private handleKline(message: KlineMessage): void {
    const { s: symbol, k } = message;

    // Only process closed klines
    if (!k.x) {
      return;
    }

    const closePrice = parseFloat(k.c);

    this.priceCache.updatePrice(symbol, {
      symbol,
      bid: closePrice,
      ask: closePrice,
      last: closePrice,
      timestamp: k.T,
    });

    logger.debug(`Kline closed: ${symbol}`, {
      interval: k.i,
      close: k.c,
    });
  }

  private handleAggTrade(message: AggTradeMessage): void {
    const { s: symbol, p: price } = message;

    const tradePrice = parseFloat(price);

    this.priceCache.updatePrice(symbol, {
      symbol,
      bid: tradePrice,
      ask: tradePrice,
      last: tradePrice,
      timestamp: message.T,
    });

    logger.debug(`Trade: ${symbol} @ ${price}`);
  }
}
