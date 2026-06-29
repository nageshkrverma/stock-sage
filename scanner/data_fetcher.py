import os
import pandas as pd
import numpy as np
import requests
from datetime import datetime, timedelta
from pathlib import Path

UPSTOX_TOKEN = os.environ.get('UPSTOX_ACCESS_TOKEN', '')
BASE_URL = 'https://api.upstox.com/v2'

NIFTY_200_FALLBACK = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "ITC",
    "SBIN", "BHARTIARTL", "KOTAKBANK", "LT", "AXISBANK", "ASIANPAINT", "MARUTI",
    "TITAN", "SUNPHARMA", "ULTRACEMCO", "NESTLEIND", "POWERGRID", "NTPC",
    "BAJFINANCE", "WIPRO", "HCLTECH", "ONGC", "COALINDIA", "ADANIENT",
    "ADANIPORTS", "JSWSTEEL", "TATASTEEL", "HINDALCO", "BAJAJFINSV", "TECHM",
    "GRASIM", "DIVISLAB", "DRREDDY", "CIPLA", "BRITANNIA", "DABUR", "MARICO",
    "PIDILITIND", "BERGERPAINTS", "HAVELLS", "VOLTAS", "CROMPTON", "POLYCAB",
    "APLAPOLLO", "RATNAMANI", "RAMCOCEM", "AMBUJACEM", "TATAMOTORS", "M&M",
    "BAJAJ-AUTO", "HEROMOTOCO", "EICHERMOT", "TVSMOTORS", "ASHOKLEY", "BOSCHLTD",
    "BHEL", "SIEMENS", "ABB", "CUMMINSIND", "BPCL", "IOC", "HINDPETRO",
    "GAIL", "PETRONET", "TATAPOWER", "ADANIGREEN", "TORNTPOWER",
    "INDIGO", "IRCTC", "ZOMATO", "NYKAA", "PAYTM",
    "HDFCLIFE", "SBILIFE", "ICICIPRULI", "SBICARD", "CHOLAFIN",
    "MUTHOOTFIN", "BAJAJHLDNG", "BANKBARODA", "PNB", "CANBK",
    "IDFCFIRSTB", "FEDERALBNK", "INDUSIND", "YESBANK", "AUBANK",
    "HDFCAMC", "NIPPONLIFE", "CDSL", "BSE", "MCX",
    "LUPIN", "AUROPHARMA", "ALKEM", "BIOCON", "DIVIS",
    "INFOEDGE", "MPHASIS", "LTTS", "COFORGE", "PERSISTENT",
    "TRENT", "DMART", "PAGEIND", "VEDL", "NMDC", "SAIL",
    "JSWENERGY", "GSPL", "ANGELONE", "MOTILALOFS",
]


def _upstox_headers():
    return {
        'Authorization': f'Bearer {UPSTOX_TOKEN}',
        'Accept': 'application/json',
    }


def _to_instrument_key(symbol: str) -> str:
    """Convert NSE symbol (with or without .NS) to Upstox instrument key."""
    sym = symbol.replace('.NS', '').replace('.ns', '')
    return f'NSE_EQ|{sym}'


def _candles_to_df(candles: list) -> pd.DataFrame | None:
    """Convert Upstox candle list to OHLCV DataFrame."""
    if not candles:
        return None
    # Each candle: [timestamp, open, high, low, close, volume, oi]
    df = pd.DataFrame(candles, columns=['ts', 'Open', 'High', 'Low', 'Close', 'Volume', 'OI'])
    df['ts'] = pd.to_datetime(df['ts'])
    df.set_index('ts', inplace=True)
    df = df[['Open', 'High', 'Low', 'Close', 'Volume']].astype(float)
    df = df[df['Volume'] > 0].dropna()
    df.sort_index(inplace=True)
    return df if not df.empty else None


def _fetch_candles(instrument_key: str, interval: str, days: int) -> pd.DataFrame | None:
    """Fetch OHLCV candles from Upstox historical API."""
    to_date   = datetime.now().strftime('%Y-%m-%d')
    from_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
    url = f'{BASE_URL}/historical-candle/{requests.utils.quote(instrument_key, safe="")}/{interval}/{to_date}/{from_date}'
    try:
        resp = requests.get(url, headers=_upstox_headers(), timeout=15)
        if resp.status_code == 401:
            raise RuntimeError('Upstox token expired — please regenerate token')
        resp.raise_for_status()
        data = resp.json().get('data', {}).get('candles', [])
        return _candles_to_df(data)
    except RuntimeError:
        raise
    except Exception as e:
        return None


def get_nse_stock_list():
    csv_path = Path(__file__).parent.parent / "data" / "nse_stocks.csv"
    if csv_path.exists():
        try:
            df = pd.read_csv(csv_path)
            symbols = df["SYMBOL"].dropna().astype(str).str.strip().tolist()
            return [s for s in symbols if s]
        except Exception:
            pass
    return list(NIFTY_200_FALLBACK)


def fetch_ohlcv(symbol, period="2y", interval="1d"):
    """Fetch daily OHLCV — ~730 days."""
    key = _to_instrument_key(symbol)
    df  = _fetch_candles(key, 'day', 730)
    if df is None or len(df) < 100:
        return None
    return df


def fetch_weekly_ohlcv(symbol):
    """Fetch weekly OHLCV — ~3 years."""
    key = _to_instrument_key(symbol)
    df  = _fetch_candles(key, 'week', 1095)
    if df is None or len(df) < 30:
        return None
    return df


def fetch_monthly_ohlcv(symbol):
    """Fetch monthly OHLCV — ~5 years."""
    key = _to_instrument_key(symbol)
    df  = _fetch_candles(key, 'month', 1825)
    if df is None or len(df) < 12:
        return None
    return df


def calculate_atr(df, period=14):
    high       = df["High"]
    low        = df["Low"]
    close      = df["Close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr = tr.ewm(span=period, adjust=False).mean()
    return float(atr.iloc[-1])


def get_delivery_proxy(df):
    high   = df["High"].tail(5)
    low    = df["Low"].tail(5)
    close  = df["Close"].tail(5)
    ranges = high - low
    ratios = (close - low) / ranges.replace(0, np.nan)
    ratios = ratios.dropna()
    if ratios.empty:
        return 0.5
    return float(ratios.mean())
