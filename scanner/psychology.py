import pandas as pd
import numpy as np


PSYCHOLOGY_EXPLANATIONS = {
    "LIQUIDITY_GRAB": {
        "title": "Liquidity Grab",
        "what_happened": "The price dipped below a key support level, triggering stop-loss orders from retail traders, then quickly reversed and closed back above that support.",
        "what_it_means": "Smart money (institutions) intentionally pushed the price down to buy cheaply from panicking retail sellers. The fast reversal shows strong buying interest waiting below.",
        "action": "This is one of the highest-probability buy setups. Look to enter on the next candle if it confirms bullish momentum. Place stop-loss below the wick low.",
    },
    "CAPITULATION": {
        "title": "Capitulation",
        "what_happened": "A large number of traders gave up and sold their positions in panic, creating a massive spike in volume with a long lower wick.",
        "what_it_means": "When everyone who wanted to sell has sold, there are no more sellers left. This exhaustion point often marks the bottom of a down move.",
        "action": "Watch for the next candle to confirm a bounce. This is a buying opportunity but wait for at least one green candle confirmation before entering.",
    },
    "SMART_MONEY_ACCUMULATION": {
        "title": "Institutional Accumulation",
        "what_happened": "The price has been moving in a very tight range for several days near a demand zone, with higher-than-normal delivery volumes.",
        "what_it_means": "Large institutions are quietly buying shares without moving the price too much. They want to accumulate a large position before the price rises.",
        "action": "This is a patient setup. Entry near the bottom of the range with a stop below the zone. The breakout from this range can be explosive.",
    },
    "DISTRIBUTION": {
        "title": "Distribution",
        "what_happened": "The price has been moving in a tight range near a supply zone, with repeated rejection at the highs and decreasing volume on up-moves.",
        "what_it_means": "Big players are selling their positions into retail buyers at resistance. Once they finish selling, the price typically drops sharply.",
        "action": "Avoid buying here. If you hold this stock, consider taking profits. Shorts can look for breakdown confirmation below the range.",
    },
    "BULL_TRAP": {
        "title": "Bull Trap",
        "what_happened": "The price broke above a resistance level, which attracted buyers, but then quickly fell back below resistance on low volume.",
        "what_it_means": "The breakout was fake. Retail traders who bought the breakout are now trapped with losses. Their eventual stop-loss selling will push prices lower.",
        "action": "Do not buy this breakout. If you're already in, set a tight stop. Wait for the price to retake the breakout level convincingly with strong volume.",
    },
    "BEAR_TRAP": {
        "title": "Bear Trap",
        "what_happened": "The price broke below a key support level, which triggered short-sellers to enter, but then quickly reversed back above support.",
        "what_it_means": "The breakdown was fake. Short sellers are now trapped and will be forced to buy back (cover) their positions, pushing the price higher.",
        "action": "This is a bullish signal. The covering of short positions will add buying pressure. Look to enter long with a stop below the trap low.",
    },
    "FOMO_ZONE": {
        "title": "FOMO Risk Zone",
        "what_happened": "The price has run up significantly from its base, RSI is overbought, and volume is declining — meaning fewer buyers are chasing the move.",
        "what_it_means": "The easy money has been made. Buying here means paying a premium and taking on high risk with limited upside. Late buyers often get trapped at tops.",
        "action": "Do NOT enter now. Wait patiently for the price to pull back to a demand zone. Missing a move is better than buying at the top.",
    },
    "EUPHORIA": {
        "title": "Euphoria Zone",
        "what_happened": "The price is far above its long-term average with extreme RSI readings, near a known supply zone where sellers have previously entered.",
        "what_it_means": "Extreme greed has set in. At these levels, sellers significantly outnumber buyers. Historical patterns show sharp corrections from euphoria zones.",
        "action": "Absolutely avoid new entries. If holding, consider taking partial profits. The risk-reward is very unfavorable for buyers at this stage.",
    },
}


def analyze_psychology(df, zone, rsi):
    if len(df) < 20:
        return [], []

    signals = []
    disqualifiers = []

    current_price = float(df["Close"].iloc[-1])
    latest = df.iloc[-1]
    prev10 = df.tail(10)

    # Volume averages
    avg_vol_20 = df["Volume"].tail(21).iloc[:-1].mean()
    avg_vol_10 = df["Volume"].tail(11).iloc[:-1].mean()
    latest_vol = float(df["Volume"].iloc[-1])
    vol_ratio_20 = latest_vol / avg_vol_20 if avg_vol_20 > 0 else 1.0
    vol_ratio_10 = latest_vol / avg_vol_10 if avg_vol_10 > 0 else 1.0

    zone_top = zone.get("top", current_price)
    zone_bottom = zone.get("bottom", current_price)

    # 200 EMA for euphoria check
    ema200 = df["Close"].ewm(span=200, adjust=False).mean().iloc[-1] if len(df) >= 200 else current_price
    price_vs_200ema_pct = (current_price - ema200) / ema200 * 100

    # 1. LIQUIDITY_GRAB
    if zone["type"] == "DEMAND":
        if (latest["Low"] < zone_bottom * 0.998
                and latest["Close"] > zone_bottom
                and vol_ratio_20 > 1.5):
            signals.append({
                "type": "LIQUIDITY_GRAB",
                "label": "🎯 Liquidity Grab",
                "description": "Smart money swept retail stop losses below support — reversal high probability",
                "weight": 30,
            })

    # 2. CAPITULATION
    total_range = latest["High"] - latest["Low"]
    lower_wick = min(latest["Open"], latest["Close"]) - latest["Low"]
    wick_ratio = lower_wick / total_range if total_range > 0 else 0
    if (wick_ratio > 0.55
            and vol_ratio_10 > 2.0
            and zone["type"] == "DEMAND"):
        signals.append({
            "type": "CAPITULATION",
            "label": "😨 Capitulation",
            "description": "Panic selling absorbed by institutions — accumulation zone active",
            "weight": 25,
        })

    # 3. SMART_MONEY_ACCUMULATION
    price_range_10 = (prev10["High"].max() - prev10["Low"].min()) / prev10["Close"].mean() * 100
    closes_10 = prev10["Close"].values
    drift_up = closes_10[-1] > closes_10[0]
    from data_fetcher import get_delivery_proxy
    delivery = get_delivery_proxy(df)
    if (price_range_10 < 3.0
            and delivery > 0.60
            and zone["type"] == "DEMAND"
            and drift_up):
        signals.append({
            "type": "SMART_MONEY_ACCUMULATION",
            "label": "🐋 Institutional Accumulation",
            "description": "Quiet accumulation detected — big players building positions",
            "weight": 25,
        })

    # 4. DISTRIBUTION
    upper_wicks = []
    for _, row in prev10.iterrows():
        uw = row["High"] - max(row["Open"], row["Close"])
        rng = row["High"] - row["Low"]
        upper_wicks.append(uw / rng if rng > 0 else 0)
    avg_upper_wick = sum(upper_wicks) / len(upper_wicks)
    up_days = prev10[prev10["Close"] > prev10["Open"]]
    down_vol = False
    if len(up_days) >= 3:
        up_vols = up_days["Volume"].values
        if len(up_vols) >= 2 and up_vols[-1] < up_vols[0]:
            down_vol = True
    if (price_range_10 < 3.0
            and avg_upper_wick > 0.3
            and down_vol
            and zone["type"] == "SUPPLY"):
        signals.append({
            "type": "DISTRIBUTION",
            "label": "📤 Distribution",
            "description": "Smart money offloading positions — supply zone active",
            "weight": 25,
        })

    # 5. BULL_TRAP
    if len(df) >= 5:
        resistance = zone_top if zone["type"] == "SUPPLY" else None
        if resistance:
            prev2 = df.tail(4)
            broke_above = any(prev2["High"].values[:-1] > resistance)
            closed_below = prev2["Close"].iloc[-1] < resistance
            weak_vol = float(prev2["Volume"].mean()) < avg_vol_20 * 0.8
            if broke_above and closed_below and weak_vol:
                signals.append({
                    "type": "BULL_TRAP",
                    "label": "⚠️ Bull Trap",
                    "description": "False breakout — retail trapped long, reversal likely",
                    "weight": 20,
                })

    # 6. BEAR_TRAP
    if len(df) >= 5:
        support = zone_bottom if zone["type"] == "DEMAND" else None
        if support:
            prev2 = df.tail(4)
            broke_below = any(prev2["Low"].values[:-1] < support)
            closed_above = prev2["Close"].iloc[-1] > support
            weak_vol_bt = float(prev2["Volume"].mean()) < avg_vol_20 * 0.8
            if broke_below and closed_above and weak_vol_bt:
                signals.append({
                    "type": "BEAR_TRAP",
                    "label": "⚠️ Bear Trap",
                    "description": "False breakdown — shorts trapped, squeeze likely upward",
                    "weight": 20,
                })

    # Disqualifiers
    # 7. FOMO_ZONE
    nearest_demand_top = zone_top if zone["type"] == "DEMAND" else current_price
    dist_from_zone = (current_price - nearest_demand_top) / nearest_demand_top * 100 if nearest_demand_top > 0 else 0
    vol_declining_3 = False
    if len(df) >= 4:
        last3_vols = df["Volume"].tail(3).values
        vol_declining_3 = last3_vols[0] > last3_vols[1] > last3_vols[2]
    if dist_from_zone > 7 and rsi > 72 and vol_declining_3:
        disqualifiers.append({
            "type": "FOMO_ZONE",
            "label": "🚫 FOMO Risk",
            "description": "Price extended — late entry risk, wait for pullback to zone",
            "weight": -40,
        })

    # 8. EUPHORIA
    if price_vs_200ema_pct > 15 and rsi > 78 and zone["type"] == "SUPPLY":
        disqualifiers.append({
            "type": "EUPHORIA",
            "label": "🤑 Euphoria Zone",
            "description": "Extreme greed — avoid entry, distribution likely",
            "weight": -35,
        })

    return signals, disqualifiers


def get_sentiment_score(psychology_signals):
    total = sum(s["weight"] for s in psychology_signals)
    if total > 40:
        return total, "STRONG_BUY"
    if total > 20:
        return total, "BUY"
    if total >= 0:
        return total, "WEAK_BUY"
    return total, "AVOID"


def get_fear_greed_position(rsi, price_vs_200ema_pct, psychology_signals):
    # RSI component: 0-1
    rsi_component = (rsi - 20) / 80.0  # RSI 20=0, 100=1
    rsi_component = max(0.0, min(1.0, rsi_component))

    # Price vs 200 EMA: -20% = 0, +20% = 1
    ema_component = (price_vs_200ema_pct + 20) / 40.0
    ema_component = max(0.0, min(1.0, ema_component))

    # Psychology boost/drag
    psych_score = sum(s["weight"] for s in psychology_signals)
    psych_component = (psych_score + 50) / 100.0  # -50 to +50 normalized
    psych_component = max(0.0, min(1.0, psych_component))

    position = rsi_component * 0.4 + ema_component * 0.3 + psych_component * 0.3
    return round(max(0.0, min(1.0, position)), 3)


def get_psychology_explanation(psych_type):
    return PSYCHOLOGY_EXPLANATIONS.get(psych_type, {
        "title": psych_type,
        "what_happened": "A market pattern was detected.",
        "what_it_means": "Price action analysis suggests a potential move.",
        "action": "Review the full signal before trading.",
    })
