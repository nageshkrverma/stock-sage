import pandas as pd
import numpy as np


def get_ema(df, period):
    return df["Close"].ewm(span=period, adjust=False).mean()


def get_trend_bias(df):
    if len(df) < 200:
        return "NEUTRAL"
    ema50 = get_ema(df, 50)
    ema200 = get_ema(df, 200)
    close = df["Close"].iloc[-1]
    e50 = ema50.iloc[-1]
    e200 = ema200.iloc[-1]
    if close > e200 and e50 > e200:
        return "BULLISH"
    if close < e200 and e50 < e200:
        return "BEARISH"
    return "NEUTRAL"


def detect_candlestick_pattern(df):
    if len(df) < 3:
        return None

    c0 = df.iloc[-1]  # current
    c1 = df.iloc[-2]  # previous
    c2 = df.iloc[-3]  # two ago

    def body(c):
        return abs(c["Close"] - c["Open"])

    def total_range(c):
        return c["High"] - c["Low"] if c["High"] != c["Low"] else 0.0001

    def upper_wick(c):
        return c["High"] - max(c["Open"], c["Close"])

    def lower_wick(c):
        return min(c["Open"], c["Close"]) - c["Low"]

    def is_green(c):
        return c["Close"] > c["Open"]

    def is_red(c):
        return c["Close"] < c["Open"]

    # Bullish Engulfing
    if (is_red(c1) and is_green(c0)
            and c0["Open"] < c1["Close"]
            and c0["Close"] > c1["Open"]):
        return {"pattern": "Bullish Engulfing", "score": 25, "bullish": True}

    # Bearish Engulfing
    if (is_green(c1) and is_red(c0)
            and c0["Open"] > c1["Close"]
            and c0["Close"] < c1["Open"]):
        return {"pattern": "Bearish Engulfing", "score": 25, "bullish": False}

    # Pin Bar / Hammer (bullish)
    b = body(c0)
    lw = lower_wick(c0)
    uw = upper_wick(c0)
    tr = total_range(c0)
    if lw > 2 * b and uw < 0.3 * tr and b > 0:
        return {"pattern": "Pin Bar / Hammer", "score": 20, "bullish": True}

    # Shooting Star (bearish)
    if uw > 2 * b and lw < 0.3 * tr and b > 0:
        return {"pattern": "Shooting Star", "score": 20, "bullish": False}

    # Morning Star (3-candle bullish reversal)
    if (is_red(c2)
            and body(c1) < 0.3 * body(c2)
            and is_green(c0)
            and c0["Close"] > (c2["Open"] + c2["Close"]) / 2):
        return {"pattern": "Morning Star", "score": 30, "bullish": True}

    # Inside Bar
    if (c0["High"] < c1["High"] and c0["Low"] > c1["Low"]):
        bullish = is_green(c0)
        return {"pattern": "Inside Bar", "score": 10, "bullish": bullish}

    return None


def check_volume_confirmation(df):
    if len(df) < 21:
        return {"ratio": 1.0, "confirmed": False}
    avg_vol = df["Volume"].iloc[-21:-1].mean()
    latest_vol = df["Volume"].iloc[-1]
    ratio = float(latest_vol / avg_vol) if avg_vol > 0 else 1.0
    return {"ratio": round(ratio, 2), "confirmed": ratio > 1.5}


def check_structure_break(df):
    if len(df) < 20:
        return {"direction": "NONE", "score": 0}
    window = df.tail(20)
    highs = window["High"]
    lows = window["Low"]
    swing_high = highs.iloc[:-1].max()
    swing_low = lows.iloc[:-1].min()
    latest_close = df["Close"].iloc[-1]
    latest_high = df["High"].iloc[-1]
    latest_low = df["Low"].iloc[-1]

    if latest_close > swing_high:
        return {"direction": "BULLISH", "score": 20}
    if latest_close < swing_low:
        return {"direction": "BEARISH", "score": 20}
    return {"direction": "NONE", "score": 0}


def get_rsi(df, period=14):
    if len(df) < period + 1:
        return 50.0
    delta = df["Close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(span=period, adjust=False).mean()
    avg_loss = loss.ewm(span=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1])
