/**
 * Calculate percentage change
 */
export function percentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calculate price from percentage
 */
export function priceFromPercentage(basePrice: number, percentage: number): number {
  return basePrice * (1 + percentage / 100);
}

/**
 * Round to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate position size in base asset
 */
export function calculatePositionSize(
  capitalUsdt: number,
  leverage: number,
  entryPrice: number
): number {
  return (capitalUsdt * leverage) / entryPrice;
}

/**
 * Calculate PnL for a trade
 */
export function calculatePnL(
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  leverage: number
): {
  pnl: number;
  pnlPercent: number;
} {
  let priceDiff: number;
  
  if (side === 'LONG') {
    priceDiff = exitPrice - entryPrice;
  } else {
    priceDiff = entryPrice - exitPrice;
  }
  
  const pnl = (priceDiff / entryPrice) * quantity * entryPrice * leverage;
  const pnlPercent = (priceDiff / entryPrice) * 100 * leverage;
  
  return { pnl, pnlPercent };
}

/**
 * Calculate stop loss price
 */
export function calculateStopLoss(
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  stopLossPercent: number
): number {
  if (side === 'LONG') {
    return entryPrice * (1 - stopLossPercent / 100);
  } else {
    return entryPrice * (1 + stopLossPercent / 100);
  }
}

/**
 * Calculate take profit price
 */
export function calculateTakeProfit(
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  takeProfitPercent: number
): number {
  if (side === 'LONG') {
    return entryPrice * (1 + takeProfitPercent / 100);
  } else {
    return entryPrice * (1 - takeProfitPercent / 100);
  }
}

/**
 * Calculate liquidation price
 */
export function calculateLiquidationPrice(
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  leverage: number,
  maintenanceMarginRate: number = 0.004
): number {
  if (side === 'LONG') {
    return entryPrice * (1 - (1 / leverage) + maintenanceMarginRate);
  } else {
    return entryPrice * (1 + (1 / leverage) - maintenanceMarginRate);
  }
}

/**
 * Format number with commas
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
