import { createModuleLogger } from '../config/logger';
import { TradeEvent } from '../types/events.types';

const logger = createModuleLogger('PositionTracker');

interface Position extends TradeEvent {
  isOpen: boolean;
}

export class PositionTracker {
  private static instance: PositionTracker;
  private positions: Map<string, Position>;

  private constructor() {
    this.positions = new Map();
  }

  public static getInstance(): PositionTracker {
    if (!PositionTracker.instance) {
      PositionTracker.instance = new PositionTracker();
    }
    return PositionTracker.instance;
  }

  public addPosition(trade: TradeEvent): void {
    if (trade.tradeId) {
      this.positions.set(trade.tradeId, {
        ...trade,
        isOpen: true,
      });
      logger.info(`Position added: ${trade.tradeId}`, {
        symbol: trade.symbol,
        side: trade.side,
      });
    }
  }

  public closePosition(tradeId: string, exitPrice: number, pnl: number, pnlPercent: number): void {
    const position = this.positions.get(tradeId);
    if (position) {
      position.isOpen = false;
      position.exitPrice = exitPrice;
      position.pnl = pnl;
      position.pnlPercent = pnlPercent;
      
      logger.info(`Position closed: ${tradeId}`, { pnl, pnlPercent });
    }
  }

  public getOpenPositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.isOpen);
  }

  public getPosition(tradeId: string): Position | undefined {
    return this.positions.get(tradeId);
  }

  public getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }
}
