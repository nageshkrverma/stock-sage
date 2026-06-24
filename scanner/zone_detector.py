import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone


def detect_demand_zones(df, atr):
    zones = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=548)  # ~18 months

    for i in range(5, len(df) - 5):
        idx = df.index[i]
        if hasattr(idx, "tzinfo") and idx.tzinfo is None:
            idx_dt = idx.to_pydatetime().replace(tzinfo=timezone.utc)
        else:
            idx_dt = pd.Timestamp(idx).to_pydatetime()
            if idx_dt.tzinfo is None:
                idx_dt = idx_dt.replace(tzinfo=timezone.utc)
        if idx_dt < cutoff:
            continue

        # Prior drop: 3 candles before base
        prior_changes = []
        for j in range(i - 3, i):
            o = df["Open"].iloc[j]
            c = df["Close"].iloc[j]
            if o != 0:
                prior_changes.append((c - o) / o * 100)
        if not prior_changes or sum(prior_changes) >= -2.5:
            continue

        # Base: 2-3 tight candles
        base_indices = []
        for j in range(i, min(i + 3, len(df))):
            candle_range = df["High"].iloc[j] - df["Low"].iloc[j]
            if candle_range < 0.5 * atr:
                base_indices.append(j)
            else:
                break
        if len(base_indices) < 2:
            continue

        base_end = base_indices[-1]
        if base_end + 3 >= len(df):
            continue

        # After rally: 3 candles after base
        after_changes = []
        for j in range(base_end + 1, min(base_end + 4, len(df))):
            o = df["Open"].iloc[j]
            c = df["Close"].iloc[j]
            if o != 0:
                after_changes.append((c - o) / o * 100)
        if not after_changes or sum(after_changes) <= 2.5:
            continue

        zone_top = df["High"].iloc[base_indices].max()
        zone_bottom = df["Low"].iloc[base_indices].min()
        impulse_strength = sum(after_changes)

        # Check freshness and touches after zone creation
        post_df = df.iloc[base_end + 1:]
        fresh = True
        touches = 0
        for _, row in post_df.iterrows():
            if row["Low"] <= zone_top * 1.005:
                touches += 1
                if row["Low"] <= zone_top:
                    fresh = False

        strength = calculate_zone_strength(df, {
            "fresh": fresh,
            "touches": touches,
            "impulse_strength": impulse_strength,
            "origin_date": df.index[i],
        }, i)

        zones.append({
            "type": "DEMAND",
            "top": float(zone_top),
            "bottom": float(zone_bottom),
            "origin_date": str(df.index[i])[:10],
            "impulse_strength": float(impulse_strength),
            "fresh": fresh,
            "touches": touches,
            "strength_score": float(strength),
        })

    zones.sort(key=lambda z: z["strength_score"], reverse=True)
    return zones


def detect_supply_zones(df, atr):
    zones = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=548)

    for i in range(5, len(df) - 5):
        idx = df.index[i]
        if hasattr(idx, "tzinfo") and idx.tzinfo is None:
            idx_dt = idx.to_pydatetime().replace(tzinfo=timezone.utc)
        else:
            idx_dt = pd.Timestamp(idx).to_pydatetime()
            if idx_dt.tzinfo is None:
                idx_dt = idx_dt.replace(tzinfo=timezone.utc)
        if idx_dt < cutoff:
            continue

        # Prior rally
        prior_changes = []
        for j in range(i - 3, i):
            o = df["Open"].iloc[j]
            c = df["Close"].iloc[j]
            if o != 0:
                prior_changes.append((c - o) / o * 100)
        if not prior_changes or sum(prior_changes) <= 2.5:
            continue

        # Base
        base_indices = []
        for j in range(i, min(i + 3, len(df))):
            candle_range = df["High"].iloc[j] - df["Low"].iloc[j]
            if candle_range < 0.5 * atr:
                base_indices.append(j)
            else:
                break
        if len(base_indices) < 2:
            continue

        base_end = base_indices[-1]
        if base_end + 3 >= len(df):
            continue

        # After drop
        after_changes = []
        for j in range(base_end + 1, min(base_end + 4, len(df))):
            o = df["Open"].iloc[j]
            c = df["Close"].iloc[j]
            if o != 0:
                after_changes.append((c - o) / o * 100)
        if not after_changes or sum(after_changes) >= -2.5:
            continue

        zone_top = df["High"].iloc[base_indices].max()
        zone_bottom = df["Low"].iloc[base_indices].min()
        impulse_strength = abs(sum(after_changes))

        post_df = df.iloc[base_end + 1:]
        fresh = True
        touches = 0
        for _, row in post_df.iterrows():
            if row["High"] >= zone_bottom * 0.995:
                touches += 1
                if row["High"] >= zone_bottom:
                    fresh = False

        strength = calculate_zone_strength(df, {
            "fresh": fresh,
            "touches": touches,
            "impulse_strength": impulse_strength,
            "origin_date": df.index[i],
        }, i)

        zones.append({
            "type": "SUPPLY",
            "top": float(zone_top),
            "bottom": float(zone_bottom),
            "origin_date": str(df.index[i])[:10],
            "impulse_strength": float(impulse_strength),
            "fresh": fresh,
            "touches": touches,
            "strength_score": float(strength),
        })

    zones.sort(key=lambda z: z["strength_score"], reverse=True)
    return zones


def calculate_zone_strength(df, zone, i):
    score = 0

    # Freshness (40 pts)
    if zone.get("fresh"):
        score += 40
    elif zone.get("touches", 0) <= 1:
        score += 20

    # Impulse (30 pts)
    impulse = zone.get("impulse_strength", 0)
    if impulse > 5:
        score += 30
    elif impulse > 3:
        score += 20
    elif impulse > 1.5:
        score += 10

    # Recency (30 pts)
    try:
        origin = pd.Timestamp(zone["origin_date"])
        now = pd.Timestamp.now()
        days_ago = (now - origin).days
        if days_ago < 30:
            score += 30
        elif days_ago < 90:
            score += 20
        elif days_ago < 180:
            score += 10
    except Exception:
        score += 10

    return min(score, 100)


def is_price_at_zone(current_price, zone, buffer_pct=0.5):
    buf = buffer_pct / 100
    return (
        zone["bottom"] * (1 - buf) <= current_price <= zone["top"] * (1 + buf)
    )


def find_next_resistance(df, current_price):
    supply_zones = detect_supply_zones(df, 0)
    above = [z for z in supply_zones if z["top"] > current_price]
    if not above:
        # Fallback: recent swing high
        highs = df["High"].tail(60)
        candidates = highs[highs > current_price]
        if candidates.empty:
            return current_price * 1.08
        return float(candidates.min())
    above.sort(key=lambda z: z["bottom"])
    return above[0]["bottom"]


def find_next_support(df, current_price):
    demand_zones = detect_demand_zones(df, 0)
    below = [z for z in demand_zones if z["bottom"] < current_price]
    if not below:
        lows = df["Low"].tail(60)
        candidates = lows[lows < current_price]
        if candidates.empty:
            return current_price * 0.92
        return float(candidates.max())
    below.sort(key=lambda z: z["top"], reverse=True)
    return below[0]["top"]
