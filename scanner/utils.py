import pandas as pd
from pathlib import Path


def load_stock_metadata():
    """Return dict: symbol -> {name, sector, market_cap}"""
    csv_path = Path(__file__).parent.parent / "data" / "nse_stocks.csv"
    if not csv_path.exists():
        return {}
    try:
        df = pd.read_csv(csv_path)
        result = {}
        for _, row in df.iterrows():
            sym = str(row.get("SYMBOL", "")).strip()
            if sym:
                result[sym] = {
                    "name": str(row.get("NAME", sym)).strip(),
                    "sector": str(row.get("SECTOR", "Unknown")).strip(),
                    "market_cap": str(row.get("MARKET_CAP", "")).strip(),
                }
        return result
    except Exception:
        return {}


def format_date(dt):
    if hasattr(dt, "strftime"):
        return dt.strftime("%Y-%m-%d")
    return str(dt)[:10]
