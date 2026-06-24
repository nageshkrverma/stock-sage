import time
from datetime import datetime, timezone

from data_fetcher import (
    fetch_ohlcv,
    fetch_weekly_ohlcv,
    fetch_monthly_ohlcv,
    calculate_atr,
)
from zone_detector import detect_demand_zones, detect_supply_zones, is_price_at_zone
from price_action import (
    get_trend_bias,
    detect_candlestick_pattern,
    check_volume_confirmation,
    check_structure_break,
    get_rsi,
)
from psychology import (
    analyze_psychology,
    get_sentiment_score,
    get_fear_greed_position,
)
from holding_classifier import (
    classify_holding_period,
    get_holding_label,
    calculate_expected_profit,
)
from utils import load_stock_metadata


_meta = None


def _get_meta():
    global _meta
    if _meta is None:
        _meta = load_stock_metadata()
    return _meta


def generate_signals_for_stock(symbol):
    ticker_clean = symbol.replace(".NS", "").replace(".BO", "")
    meta = _get_meta()
    stock_info = meta.get(ticker_clean, {})
    name = stock_info.get("name", ticker_clean)
    sector = stock_info.get("sector", "Unknown")

    daily_df = fetch_ohlcv(symbol)
    if daily_df is None or len(daily_df) < 100:
        return []

    weekly_df = fetch_weekly_ohlcv(symbol)
    monthly_df = fetch_monthly_ohlcv(symbol)

    atr = calculate_atr(daily_df)
    current_price = float(daily_df["Close"].iloc[-1])
    rsi = get_rsi(daily_df)
    trend = get_trend_bias(daily_df)

    prev_close = float(daily_df["Close"].iloc[-2]) if len(daily_df) >= 2 else current_price
    day_change_pct = round((current_price - prev_close) / prev_close * 100, 2) if prev_close else 0.0

    demand_zones = detect_demand_zones(daily_df, atr)
    supply_zones = detect_supply_zones(daily_df, atr)

    signals = []

    # Check demand zones (BUY signals)
    for idx, zone in enumerate(demand_zones):
        if not is_price_at_zone(current_price, zone, buffer_pct=15.0):
            continue
        signal = _build_signal_for_zone(
            symbol, ticker_clean, name, sector,
            daily_df, weekly_df, monthly_df,
            zone, current_price, day_change_pct, rsi, trend, "BUY", atr, zone_idx=idx
        )
        if signal:
            signals.append(signal)

    # Check supply zones (SELL/SHORT signals)
    for idx, zone in enumerate(supply_zones):
        if not is_price_at_zone(current_price, zone, buffer_pct=15.0):
            continue
        signal = _build_signal_for_zone(
            symbol, ticker_clean, name, sector,
            daily_df, weekly_df, monthly_df,
            zone, current_price, day_change_pct, rsi, trend, "SELL", atr, zone_idx=idx
        )
        if signal:
            signals.append(signal)

    return signals


def _build_signal_for_zone(
    symbol, ticker_clean, name, sector,
    daily_df, weekly_df, monthly_df,
    zone, current_price, day_change_pct, rsi, trend, signal_type, atr, zone_idx=0
):
    pattern = detect_candlestick_pattern(daily_df)
    volume_conf = check_volume_confirmation(daily_df)
    structure = check_structure_break(daily_df)
    psychology_signals, disqualifiers = analyze_psychology(daily_df, zone, rsi)

    # Never block — disqualifiers are shown as warnings, not filters

    # Entry zone
    entry_low = zone["bottom"]
    entry_high = zone["top"]
    entry_mid = (entry_low + entry_high) / 2

    # Stop loss
    if signal_type == "BUY":
        stop_loss = entry_low * 0.97  # 3% below zone bottom
        t1 = entry_mid * 1.08
        t2 = entry_mid * 1.16
    else:
        stop_loss = entry_high * 1.03
        t1 = entry_mid * 0.92
        t2 = entry_mid * 0.84

    sl_pct = abs(entry_mid - stop_loss) / entry_mid * 100
    t1_pct = abs(t1 - entry_mid) / entry_mid * 100
    risk = abs(entry_mid - stop_loss)
    reward = abs(t1 - entry_mid)
    rr = round(reward / risk, 2) if risk > 0 else 0

    holding = classify_holding_period(zone, weekly_df, monthly_df)
    holding_label = get_holding_label(holding)
    expected_profit = calculate_expected_profit(entry_mid, t1, t2, holding)

    ema200_val = daily_df["Close"].ewm(span=200, adjust=False).mean().iloc[-1] if len(daily_df) >= 200 else current_price
    price_vs_200ema_pct = (current_price - ema200_val) / ema200_val * 100

    fear_greed = get_fear_greed_position(rsi, price_vs_200ema_pct, psychology_signals)
    psych_score, sentiment = get_sentiment_score(psychology_signals)

    confidence = calculate_confidence(
        zone, psychology_signals, pattern, volume_conf, trend, rr
    )

    if confidence < 25:
        return None

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    signal_id = f"{ticker_clean}_{date_str}_{zone['type']}_{zone_idx}"

    return build_signal_dict(
        symbol=ticker_clean,
        name=name,
        sector=sector,
        signal_type=signal_type,
        generated_at=now.isoformat(),
        signal_id=signal_id,
        zone=zone,
        entry_low=entry_low,
        entry_high=entry_high,
        stop_loss=stop_loss,
        sl_pct=sl_pct,
        t1=t1,
        t1_pct=t1_pct,
        t2=t2,
        t2_pct=abs(t2 - entry_mid) / entry_mid * 100,
        expected_profit=expected_profit,
        rr=rr,
        confidence=confidence,
        holding=holding,
        holding_label=holding_label,
        psychology=psychology_signals,
        disqualifiers=disqualifiers,
        trend=trend,
        pattern=pattern,
        volume_conf=volume_conf,
        sentiment=sentiment,
        fear_greed=fear_greed,
        rsi=rsi,
        current_price=current_price,
        day_change_pct=day_change_pct,
    )


def calculate_confidence(zone, psychology_signals, pattern, volume_conf, trend, rr):
    score = 0

    # Zone strength (25 pts max)
    zone_score = zone.get("strength_score", 0)
    score += min(25, zone_score * 0.25)

    # Psychology (25 pts max)
    psych_total = sum(s["weight"] for s in psychology_signals)
    score += min(25, max(0, psych_total))

    # Candlestick pattern (20 pts max)
    if pattern:
        score += min(20, pattern.get("score", 0))

    # Volume confirmation (15 pts)
    ratio = volume_conf.get("ratio", 1.0)
    if volume_conf.get("confirmed"):
        score += 15
    elif ratio > 1.1:
        score += 7

    # Trend alignment (10 pts)
    if trend == "BULLISH":
        score += 10
    elif trend == "NEUTRAL":
        score += 5

    # Risk:Reward (5 pts)
    if rr >= 2.0:
        score += 5
    elif rr >= 1.5:
        score += 3

    return int(min(100, score))


def build_signal_dict(
    symbol, name, sector, signal_type, generated_at, signal_id,
    zone, entry_low, entry_high, stop_loss, sl_pct,
    t1, t1_pct, t2, t2_pct, expected_profit, rr,
    confidence, holding, holding_label, psychology, disqualifiers,
    trend, pattern, volume_conf, sentiment, fear_greed, rsi,
    current_price=0, day_change_pct=0,
):
    def _b(v): return bool(v)  # convert numpy bool to Python bool
    def _f(v, n=2): return round(float(v), n)  # convert numpy float to Python float

    vc = volume_conf or {}
    cp = pattern or {}

    return {
        "id": signal_id,
        "symbol": symbol,
        "name": name,
        "sector": sector,
        "exchange": "NSE",
        "signal_type": signal_type,
        "generated_at": generated_at,
        "holding_period": holding,
        "holding_label": holding_label,
        "entry": {
            "low": _f(entry_low),
            "high": _f(entry_high),
        },
        "stop_loss": _f(stop_loss),
        "stop_loss_pct": _f(sl_pct),
        "targets": [
            {"price": _f(t1), "pct": _f(t1_pct), "label": "Target 1"},
            {"price": _f(t2), "pct": _f(t2_pct), "label": "Target 2"},
        ],
        "expected_profit": expected_profit,
        "risk_reward": _f(rr),
        "confidence": int(confidence),
        "zone": {
            "type": zone["type"],
            "top": _f(zone["top"]),
            "bottom": _f(zone["bottom"]),
            "strength_score": _f(zone.get("strength_score", 0), 1),
            "fresh": _b(zone.get("fresh", False)),
            "origin_date": str(zone.get("origin_date", "")),
            "touches": int(zone.get("touches", 0)),
        },
        "trend_bias": trend,
        "candlestick_pattern": {k: (bool(v) if isinstance(v, (bool,)) else (float(v) if hasattr(v, '__float__') else v)) for k, v in cp.items()} if cp else None,
        "volume_confirmation": {"ratio": _f(vc.get("ratio", 0)), "confirmed": _b(vc.get("confirmed", False))} if vc else {},
        "psychology": psychology,
        "sentiment": sentiment,
        "fear_greed_position": _f(fear_greed),
        "disqualifiers": disqualifiers,
        "rsi": _f(rsi),
        "current_price": _f(current_price),
        "day_change_pct": _f(day_change_pct),
    }
