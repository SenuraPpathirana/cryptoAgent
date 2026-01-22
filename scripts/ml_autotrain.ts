import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} failed with code ${r.status}`);
}

function atomicReplace(src: string, dest: string) {
  const tmp = dest + ".tmp";
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dest);
}

async function main() {
  const symbols = (process.env.ML_TRAIN_SYMBOLS ?? "BTCUSDT").split(",").map(s => s.trim());
  const timeframe = process.env.ML_TRAIN_TIMEFRAME ?? "1h";
  const lookahead = process.env.ML_TRAIN_LOOKAHEAD ?? "3";
  const up = process.env.ML_TRAIN_UP_THRESHOLD ?? "0.004";
  const down = process.env.ML_TRAIN_DOWN_THRESHOLD ?? "-0.004";

  // 1) Dump candles
  run("npm", ["run", "ml:dump"]);

  // 2) Train per symbol and pick “best” (simple approach: just train first symbol)
  const symbol = symbols[0];
  const csvPath = path.resolve(`data/candles/${symbol}_${timeframe}.csv`);
  const outPath = path.resolve(`models/ml_signal_model.json`);
  const outTmp = path.resolve(`models/ml_signal_model.new.json`);

  if (!fs.existsSync(csvPath)) throw new Error(`Missing candles CSV: ${csvPath}`);

  // 3) Train
  run("python3", [
    "ml/train_signal_model.py",
    "--csv", csvPath,
    "--out", outTmp,
    "--lookahead", lookahead,
    "--up", up,
    "--down", down
  ]);

  // 4) Atomic swap
  atomicReplace(outTmp, outPath);
  console.log("✅ Updated model:", outPath);
}

main().catch((e) => {
  console.error("ML autotrain failed:", e);
  process.exit(1);
});
