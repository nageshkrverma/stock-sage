import pandas as pd


def _zone_visible_on_timeframe(zone, df_timeframe, atr_multiplier=1.0):
    """Check if a demand/supply zone's structure is visible on a higher timeframe."""
    if df_timeframe is None or len(df_timeframe) < 10:
        return False
    zone_mid = (zone["top"] + zone["bottom"]) / 2
    low_series = df_timeframe["Low"]
    high_series = df_timeframe["High"]
    # Zone is visible if the price range on that timeframe covers the zone
    for i in range(len(df_timeframe) - 1, max(len(df_timeframe) - 20, 0), -1):
        if low_series.iloc[i] <= zone_mid <= high_series.iloc[i]:
            return True
    return False


def _trend_aligned_on_timeframe(zone, df_timeframe):
    """Check if trend on the given timeframe aligns with the zone type."""
    if df_timeframe is None or len(df_timeframe) < 10:
        return False
    ema20 = df_timeframe["Close"].ewm(span=20, adjust=False).mean()
    close = df_timeframe["Close"].iloc[-1]
    e20 = ema20.iloc[-1]
    if zone["type"] == "DEMAND":
        return close > e20
    if zone["type"] == "SUPPLY":
        return close < e20
    return False


def classify_holding_period(zone, weekly_df, monthly_df):
    monthly_visible = _zone_visible_on_timeframe(zone, monthly_df)
    monthly_aligned = _trend_aligned_on_timeframe(zone, monthly_df)
    weekly_visible = _zone_visible_on_timeframe(zone, weekly_df)
    weekly_aligned = _trend_aligned_on_timeframe(zone, weekly_df)

    impulse = zone.get("impulse_strength", 0)

    if monthly_visible and monthly_aligned:
        return "1Y"
    if weekly_visible and weekly_aligned:
        if impulse > 5:
            return "6M"
        return "3M"
    if impulse > 4:
        return "30D"
    if zone.get("fresh", False):
        return "7D"
    return "15D"


def get_holding_label(holding_code):
    mapping = {
        "7D": "1-7 Days",
        "15D": "15 Days",
        "30D": "30 Days",
        "3M": "3 Months",
        "6M": "6 Months",
        "1Y": "1 Year",
    }
    return mapping.get(holding_code, holding_code)


def calculate_expected_profit(entry, target1, target2, holding):
    min_pct = round((target1 - entry) / entry * 100, 1) if entry > 0 else 0
    max_pct = round((target2 - entry) / entry * 100, 1) if entry > 0 else 0
    label = f"{min_pct}–{max_pct}%"
    return {
        "min_pct": min_pct,
        "max_pct": max_pct,
        "label": label,
    }
