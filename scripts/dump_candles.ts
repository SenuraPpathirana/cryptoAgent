import * as fs from 'fs';
import * as path from 'path';
import { BinanceDataFetcher } from '../src/market/binance_data_fetcher';
import { CandleData } from '../src/analysis/analysis_engine';

function toCsv(rows: CandleData[]): string {
  const header = ["timestamp","open","high","low","close","volume"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.timestamp, r.open, r.high, r.low, r.close, r.volume].join(","));
  }
  return lines.join("\n");
}

async function fetchMultipleBatches(
  fetcher: BinanceDataFetcher, 
  symbol: string, 
  timeframe: string, 
  totalLimit: number
): Promise<CandleData[]> {
  const maxPerRequest = 1500;
  const allCandles: CandleData[] = [];
  let remaining = totalLimit;

  while (remaining > 0) {
    const batchSize = Math.min(remaining, maxPerRequest);
    const candles = await fetcher.getKlines(symbol, timeframe, batchSize);
    
    if (candles.length === 0) break;
    
    allCandles.push(...candles);
    remaining -= candles.length;
    
    if (candles.length < batchSize) break;
    
    // Wait a bit to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return allCandles;
}

async function main() {
  const symbols = (process.env.ML_TRAIN_SYMBOLS ?? "BTCUSDT").split(",").map(s => s.trim());
  const timeframe = process.env.ML_TRAIN_TIMEFRAME ?? "1h";
  const limit = Number(process.env.ML_TRAIN_LIMIT ?? "1500");

  const outDir = path.resolve("data/candles");
  fs.mkdirSync(outDir, { recursive: true });

  const fetcher = BinanceDataFetcher.getInstance();

  for (const symbol of symbols) {
    console.log(`Fetching ${limit} candles for ${symbol}...`);
    const candles = await fetchMultipleBatches(fetcher, symbol, timeframe, limit);
    const csv = toCsv(candles);
    const outPath = path.join(outDir, `${symbol}_${timeframe}.csv`);
    fs.writeFileSync(outPath, csv, "utf-8");
    console.log("Saved:", outPath, "rows:", candles.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
