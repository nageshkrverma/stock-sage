import os
import pandas as pd
import numpy as np
import yfinance as yf
from pathlib import Path

NIFTY_200_FALLBACK = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "ITC",
    "SBIN", "BHARTIARTL", "KOTAKBANK", "LT", "AXISBANK", "ASIANPAINT", "MARUTI",
    "TITAN", "SUNPHARMA", "ULTRACEMCO", "NESTLEIND", "POWERGRID", "NTPC",
    "BAJFINANCE", "WIPRO", "HCLTECH", "ONGC", "COALINDIA", "ADANIENT",
    "ADANIPORTS", "JSWSTEEL", "TATASTEEL", "HINDALCO", "BAJAJFINSV", "TECHM",
    "GRASIM", "DIVISLAB", "DRREDDY", "CIPLA", "BRITANNIA", "DABUR", "MARICO",
    "PIDILITIND", "BERGERPAINTS", "HAVELLS", "VOLTAS", "WHIRLPOOL", "BLUESTAR",
    "CROMPTON", "POLYCAB", "APLAPOLLO", "RATNAMANI", "RAMCOCEM", "AMBUJACEM",
    "ACCLT", "SHREECEM", "JKCEMENT", "HEIDELBERG", "BIRLACORPN", "PRISMCEM",
    "TATAMOTORS", "M&M", "BAJAJ-AUTO", "HEROMOTOCO", "EICHERMOT", "TVSMOTORS",
    "ASHOKLEY", "MOTHERSON", "BOSCHLTD", "MINDAIND", "BHEL", "SIEMENS",
    "ABB", "CUMMINSIND", "THERMAX", "BPCL", "IOC", "HINDPETRO", "CASTROLIND",
    "GAIL", "PETRONET", "MGL", "IGL", "ATGL", "GUJGASLTD", "TATAPOWER",
    "ADANIGREEN", "ADANITRANS", "TORNTPOWER", "CESC", "JPPOWER", "RPOWER",
    "INDIGO", "SPICEJET", "INTERGLOBE", "IRCTC", "CONCOR", "MAHLOG",
    "ZOMATO", "NYKAA", "PAYTM", "POLICYBZR", "DELHIVERY", "CARTRADE",
    "HDFCLIFE", "SBILIFE", "ICICIPRULI", "ICICIGI", "SBICARD", "CHOLAFIN",
    "MUTHOOTFIN", "MANAPPURAM", "BAJAJHLDNG", "PNBHOUSING", "LICHSGFIN",
    "CANFINHOME", "HOMEFIRST", "AAVAS", "APTUS", "REPCO", "GRUH",
    "BANKBARODA", "PNB", "CANBK", "UNIONBANK", "IDFCFIRSTB", "FEDERALBNK",
    "KARURVYSYA", "CITYUNIONB", "DCBBANK", "BANDHANBNK", "RBLBANK",
    "AUBANK", "INDUSIND", "YESBANK", "LAKSHVILAS", "TMVFINSERV",
    "HDFCAMC", "NIPPONLIFE", "UTIAMC", "ABSLAMC", "360ONE", "ISEC",
    "ANGELONE", "MOTILALOFS", "EDELWEISS", "JM", "NUVOCO", "KFINTECH",
    "CDSL", "BSE", "MCX", "IEX", "CREDITACC", "SPANDANA",
    "UJJIVAN", "EQUITAS", "SURYODAY", "ESAFSFB", "FINCARE", "UTKARSH",
    "DRREDDY", "SUNPHARMA", "CIPLA", "LUPIN", "AUROPHARMA", "ALKEM",
    "BIOCON", "GLAND", "LAURUSLABS", "DIVIS", "GRANULES", "STRIDES",
    "ABBOTINDIA", "PFIZER", "GLAXO", "SANOFI", "NATCOPHARMA", "IPCALAB",
    "TORNTPHARM", "AJANTPHARM", "JB", "ERIS", "INDOCO", "SMSPHARMA",
    "INFOEDGE", "JUSTDIAL", "TRADINGO", "MPHASIS", "LTTS", "COFORGE",
    "PERSISTENT", "NIITTECH", "HEXAWARE", "KPITTECH", "TANLA", "INTELLECT",
    "MASTEK", "ZENSAR", "SONATSOFTW", "RAMSYSTEMS", "TRIGYN", "RSYSTEMS",
    "TRENT", "SHOPERSTOP", "DMART", "VSTIND", "PAGEIND", "MANYAVAR",
    "VEDL", "NMDC", "MOIL", "NATIONALUM", "WELCORP", "SAIL",
    "JSWENERGY", "TORNTGAS", "GSPL", "GUJGAS", "INDRAPRASTHA",
]


def get_nse_stock_list():
    csv_path = Path(__file__).parent.parent / "data" / "nse_stocks.csv"
    if csv_path.exists():
        try:
            df = pd.read_csv(csv_path)
            symbols = df["SYMBOL"].dropna().astype(str).str.strip().tolist()
            return [s + ".NS" for s in symbols if s]
        except Exception:
            pass
    return [s + ".NS" for s in NIFTY_200_FALLBACK]


def fetch_ohlcv(symbol, period="2y", interval="1d"):
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval, auto_adjust=True)
        if df.empty:
            return None
        df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
        df = df[df["Volume"] > 0]
        df.dropna(inplace=True)
        if len(df) < 100:
            return None
        return df
    except Exception:
        return None


def fetch_weekly_ohlcv(symbol):
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="3y", interval="1wk", auto_adjust=True)
        if df.empty:
            return None
        df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
        df = df[df["Volume"] > 0]
        df.dropna(inplace=True)
        if len(df) < 30:
            return None
        return df
    except Exception:
        return None


def fetch_monthly_ohlcv(symbol):
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="5y", interval="1mo", auto_adjust=True)
        if df.empty:
            return None
        df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
        df = df[df["Volume"] > 0]
        df.dropna(inplace=True)
        if len(df) < 12:
            return None
        return df
    except Exception:
        return None


def calculate_atr(df, period=14):
    high = df["High"]
    low = df["Low"]
    close = df["Close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr = tr.ewm(span=period, adjust=False).mean()
    return float(atr.iloc[-1])


def get_delivery_proxy(df):
    high = df["High"].tail(5)
    low = df["Low"].tail(5)
    close = df["Close"].tail(5)
    ranges = high - low
    ratios = (close - low) / ranges.replace(0, np.nan)
    ratios = ratios.dropna()
    if ratios.empty:
        return 0.5
    return float(ratios.mean())
