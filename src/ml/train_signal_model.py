import os
import json
import math
import argparse
from dataclasses import dataclass
from typing import List, Dict, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score


# --- Minimal indicator helpers (keep it simple + stable) ---

def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()

def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    up = delta.clip(lower=0.0)
    down = (-delta).clip(lower=0.0)
    avg_up = up.rolling(period).mean()
    avg_down = down.rolling(period).mean()
    rs = avg_up / (avg_down.replace(0, np.nan))
    out = 100 - (100 / (1 + rs))
    return out.fillna(50)

def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Tuple[pd.Series, pd.Series]:
    fast_ema = ema(close, fast)
    slow_ema = ema(close, slow)
    m = fast_ema - slow_ema
    s = ema(m, signal)
    return m, s

def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df["high"]
    low = df["low"]
    close = df["close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        (high - low),
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def zscore(series: pd.Series, window: int = 50) -> pd.Series:
    mu = series.rolling(window).mean()
    sd = series.rolling(window).std().replace(0, np.nan)
    return ((series - mu) / sd).fillna(0.0)


# --- Feature builder (align conceptually with src/ml/feature_builder.ts) ---
# IMPORTANT: keep feature order stable (must match exported "features" array)

FEATURES = [
    "rsi14",
    "macd",
    "macd_signal",
    "ema50_dist",      # (close - ema50) / close
    "atr14_pct",       # atr14 / close
    "vol_z50",         # zscore(volume, 50)
]

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)

    close = df["close"]
    out["rsi14"] = rsi(close, 14)

    m, s = macd(close)
    out["macd"] = m
    out["macd_signal"] = s

    ema50 = ema(close, 50)
    out["ema50_dist"] = ((close - ema50) / close).replace([np.inf, -np.inf], 0.0).fillna(0.0)

    a = atr(df, 14)
    out["atr14_pct"] = (a / close).replace([np.inf, -np.inf], 0.0).fillna(0.0)

    out["vol_z50"] = zscore(df["volume"], 50)

    # Cleanup
    out = out.replace([np.inf, -np.inf], 0.0).fillna(0.0)
    return out


def make_labels(close: pd.Series, lookahead: int, up_th: float, down_th: float) -> pd.Series:
    """
    1 = UP, 0 = NO_TRADE, -1 = DOWN
    return = (close[t+lookahead] - close[t]) / close[t]
    """
    future = close.shift(-lookahead)
    ret = (future - close) / close
    y = pd.Series(0, index=close.index)
    y[ret > up_th] = 1
    y[ret < down_th] = -1
    return y


def train_one_csv(csv_path: str, lookahead: int, up_th: float, down_th: float) -> Dict:
    df = pd.read_csv(csv_path)

    # Expect columns: timestamp, open, high, low, close, volume
    needed = {"open","high","low","close","volume"}
    missing = needed - set(df.columns)
    if missing:
        raise ValueError(f"{csv_path} missing columns: {missing}")

    # ensure numeric
    for c in ["open","high","low","close","volume"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df = df.dropna().reset_index(drop=True)

    Xdf = build_features(df)
    y = make_labels(df["close"], lookahead, up_th, down_th)

    # drop last lookahead rows (no future label)
    Xdf = Xdf.iloc[:-lookahead]
    y = y.iloc[:-lookahead]

    # Binary training (UP vs NOT-UP) is usually more stable to start.
    # You can later extend to multi-class.
    y_bin = (y == 1).astype(int)

    X = Xdf[FEATURES].to_numpy(dtype=np.float64)

    # split
    X_train, X_test, y_train, y_test = train_test_split(X, y_bin, test_size=0.2, shuffle=False)

    # model
    model = LogisticRegression(max_iter=200, class_weight="balanced")
    model.fit(X_train, y_train)

    probs = model.predict_proba(X_test)[:, 1]
    preds = (probs >= 0.5).astype(int)

    report = classification_report(y_test, preds, output_dict=True, zero_division=0)
    try:
        auc = roc_auc_score(y_test, probs)
    except Exception:
        auc = None

    return {
        "features": FEATURES,
        "weights": model.coef_[0].tolist(),
        "bias": float(model.intercept_[0]),
        "metrics": {
            "auc": auc,
            "report": report
        }
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="Path to candles CSV")
    ap.add_argument("--out", required=True, help="Output model json path")
    ap.add_argument("--lookahead", type=int, default=3)
    ap.add_argument("--up", type=float, default=0.004)
    ap.add_argument("--down", type=float, default=-0.004)
    args = ap.parse_args()

    payload = train_one_csv(args.csv, args.lookahead, args.up, args.down)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    export = {
        "modelType": "logistic_regression",
        "version": "v1",
        "featureNames": payload["features"],
        "weights": payload["weights"],
        "bias": payload["bias"],
        "meta": {
            "lookahead": args.lookahead,
            "up_threshold": args.up,
            "down_threshold": args.down,
            "metrics": payload["metrics"]
        }
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(export, f, indent=2)

    print("Saved model:", args.out)
    if export["meta"]["metrics"]["auc"] is not None:
        print("AUC:", export["meta"]["metrics"]["auc"])


if __name__ == "__main__":
    main()
