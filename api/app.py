import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scanner'))

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

from data_fetcher import fetch_ohlcv, fetch_weekly_ohlcv, fetch_monthly_ohlcv, calculate_atr
from zone_detector import detect_demand_zones, detect_supply_zones
from price_action import get_trend_bias, detect_candlestick_pattern, check_volume_confirmation, get_rsi
from psychology import analyze_psychology, get_sentiment_score, get_fear_greed_position
from utils import load_stock_metadata


def analyse_stock(symbol: str) -> dict | None:
    sym = symbol.upper().replace('.NS', '').replace('.BO', '')
    sym_ns = sym + '.NS'

    metadata = load_stock_metadata()
    meta = metadata.get(sym, {})
    name = meta.get('name', sym)
    sector = meta.get('sector', 'Unknown')

    df = fetch_ohlcv(sym_ns)
    if df is None or len(df) < 50:
        return None

    weekly_df = fetch_weekly_ohlcv(sym_ns)
    monthly_df = fetch_monthly_ohlcv(sym_ns)

    atr = calculate_atr(df)
    current_price = float(df['Close'].iloc[-1])

    demand_zones = detect_demand_zones(df, atr)
    supply_zones = detect_supply_zones(df, atr)

    trend_bias = get_trend_bias(df)
    rsi = get_rsi(df)
    candlestick = detect_candlestick_pattern(df)
    volume = check_volume_confirmation(df)

    # Psychology against nearest zones (within 20%)
    all_psych = []
    all_disq = []
    checked_zones = []
    for z in (demand_zones + supply_zones):
        mid = (z['top'] + z['bottom']) / 2
        if abs(current_price - mid) / current_price < 0.20:
            checked_zones.append(z)
    if not checked_zones and (demand_zones or supply_zones):
        all_zones_sorted = sorted(demand_zones + supply_zones,
                                  key=lambda z: abs(current_price - (z['top'] + z['bottom']) / 2))
        checked_zones = all_zones_sorted[:1]

    for z in checked_zones:
        sigs, disq = analyze_psychology(df, z, rsi)
        for s in sigs:
            if not any(x['type'] == s['type'] for x in all_psych):
                all_psych.append(s)
        for d in disq:
            if not any(x['type'] == d['type'] for x in all_disq):
                all_disq.append(d)

    ema200 = df['Close'].ewm(span=200, adjust=False).mean().iloc[-1] if len(df) >= 200 else current_price
    price_vs_200ema_pct = (current_price - ema200) / ema200 * 100
    fear_greed = get_fear_greed_position(rsi, price_vs_200ema_pct, all_psych)

    demand_below = [z for z in demand_zones if z['top'] < current_price]
    supply_above = [z for z in supply_zones if z['bottom'] > current_price]
    nearest_demand = max(demand_below, key=lambda z: z['top']) if demand_below else (demand_zones[0] if demand_zones else None)
    nearest_supply = min(supply_above, key=lambda z: z['bottom']) if supply_above else (supply_zones[0] if supply_zones else None)

    day_change_pct = 0.0
    if len(df) >= 2:
        prev_close = float(df['Close'].iloc[-2])
        day_change_pct = ((current_price - prev_close) / prev_close) * 100

    return {
        'symbol': sym,
        'name': name,
        'sector': sector,
        'current_price': round(current_price, 2),
        'trend_bias': trend_bias,
        'rsi': round(rsi, 1),
        'volume_confirmation': volume,
        'candlestick_pattern': candlestick,
        'nearest_demand_zone': nearest_demand,
        'nearest_supply_zone': nearest_supply,
        'all_demand_zones': demand_zones[:3],
        'all_supply_zones': supply_zones[:3],
        'psychology': all_psych,
        'disqualifiers': all_disq,
        'fear_greed_position': fear_greed,
        'day_change_pct': round(day_change_pct, 2),
    }


def compute_verdict(analysis: dict, entry_price: float, quantity: int) -> dict:
    current_price = analysis['current_price']
    pnl_pct = ((current_price - entry_price) / entry_price) * 100
    pnl = (current_price - entry_price) * quantity

    trend = analysis['trend_bias']
    rsi = analysis['rsi']
    demand_zones = analysis.get('all_demand_zones', [])
    supply_zones = analysis.get('all_supply_zones', [])
    nearest_demand = analysis.get('nearest_demand_zone')
    nearest_supply = analysis.get('nearest_supply_zone')
    psychology = analysis.get('psychology', [])
    volume = analysis.get('volume_confirmation', {})

    psych_types = {p['type'] for p in psychology}
    bullish_psych = bool(psych_types & {'LIQUIDITY_GRAB', 'CAPITULATION', 'SMART_MONEY_ACCUMULATION', 'BEAR_TRAP'})

    all_demand_broken = bool(demand_zones) and all(z['bottom'] > current_price for z in demand_zones)
    near_demand = (nearest_demand is not None and
                   nearest_demand['top'] <= current_price and
                   (current_price - nearest_demand['top']) / current_price < 0.05)
    near_supply = (nearest_supply is not None and
                   nearest_supply['bottom'] >= current_price and
                   (nearest_supply['bottom'] - current_price) / current_price < 0.05)

    # Verdict decision
    if (all_demand_broken or trend == 'BEARISH') and pnl_pct < -8:
        verdict = 'EXIT'
        summary = 'The stock has broken below all key support levels. Protecting your remaining capital is the priority right now — holding further increases your risk.'
        protect_at = current_price * 1.01
        what_changes = [
            'If price recovers above ₹{:.2f} with strong buying volume'.format(
                nearest_demand['top'] if nearest_demand else current_price * 1.05),
            'If the overall market trend shifts back to bullish strongly',
            'If a strong reversal candlestick appears on high volume next session',
        ]

    elif near_demand and bullish_psych and -8 <= pnl_pct <= 0:
        verdict = 'ADD_MORE'
        summary = 'The stock is sitting on a strong support zone where big buyers have stepped in before. Your small loss here can be recovered by averaging down carefully.'
        protect_at = nearest_demand['bottom'] * 0.97 if nearest_demand else entry_price * 0.92
        what_changes = [
            'Exit immediately if price falls and closes below ₹{:.2f}'.format(protect_at),
            'If volume dries up significantly, the support may not hold',
            'If the broader market turns sharply negative',
        ]

    elif near_supply and pnl_pct > 5:
        verdict = 'PARTIAL_EXIT'
        summary = 'You have a healthy profit and the stock is near a zone where sellers have previously been active. Consider booking a portion of your profits here while keeping some to run further.'
        protect_at = nearest_demand['top'] if nearest_demand else entry_price
        what_changes = [
            'If price breaks above ₹{:.2f} with strong volume, hold remaining'.format(
                nearest_supply['top'] if nearest_supply else current_price * 1.05),
            'If RSI drops below 45, exit the remaining position',
            'If overall market weakens significantly',
        ]

    else:
        verdict = 'HOLD'
        summary = 'The stock is in a stable position. The trend is intact, support zones are holding, and there is no immediate threat to your position. Patience is the right strategy here.'
        protect_at = nearest_demand['bottom'] * 0.97 if nearest_demand else entry_price * 0.93
        what_changes = [
            'Exit if price closes below ₹{:.2f} (support broken)'.format(protect_at),
            'Consider booking partial profits near ₹{:.2f}'.format(
                nearest_supply['bottom'] if nearest_supply else current_price * 1.08),
            'Reassess if daily volume drops sharply for 3 or more days',
        ]

    # Build factors
    factors = []

    factors.append({
        'icon': '📈' if trend == 'BULLISH' else ('📉' if trend == 'BEARISH' else '↔️'),
        'description': (
            'The stock is in a healthy upward trend' if trend == 'BULLISH'
            else 'The stock is in a downward trend — proceed with caution' if trend == 'BEARISH'
            else 'The stock is moving sideways — waiting for a clear direction'
        ),
        'positive': trend == 'BULLISH',
    })

    if nearest_demand:
        dist_d = (current_price - nearest_demand['top']) / current_price * 100
        factors.append({
            'icon': '🛡️',
            'description': (
                'Support zone is nearby at ₹{:.2f} — acting as a safety net'.format(nearest_demand['top'])
                if dist_d < 5
                else 'Support zone is {:.1f}% below current price — reasonable cushion'.format(dist_d)
            ),
            'positive': dist_d < 8,
        })

    if rsi < 35:
        factors.append({'icon': '💚', 'description': 'Stock is oversold — value buyers are likely to step in soon', 'positive': True})
    elif rsi > 70:
        factors.append({'icon': '⚠️', 'description': 'Stock is overheated — risk of a pullback is higher than usual', 'positive': False})
    else:
        factors.append({'icon': '✅', 'description': 'Momentum is healthy — not overheated and not oversold', 'positive': True})

    factors.append({
        'icon': '💰' if pnl >= 0 else '📉',
        'description': 'Your position is {} ₹{:,.2f} ({}{:.2f}%)'.format(
            'up' if pnl >= 0 else 'down', abs(pnl), '+' if pnl_pct >= 0 else '', pnl_pct),
        'positive': pnl >= 0,
    })

    if bullish_psych:
        label = next((p['label'] for p in psychology if p['type'] in {'LIQUIDITY_GRAB', 'CAPITULATION', 'SMART_MONEY_ACCUMULATION'}), None)
        if label:
            factors.append({'icon': '🎯', 'description': '{} detected — institutional buying interest is present'.format(label.split(' ', 1)[-1].strip()), 'positive': True})

    factors.append({
        'icon': '📊',
        'description': (
            'Trading volume is above average — confirms the price move' if volume.get('confirmed')
            else 'Trading volume is below average — price moves lack strong conviction'
        ),
        'positive': volume.get('confirmed', False),
    })

    return {
        'verdict': verdict,
        'summary': summary,
        'factors': factors[:6],
        'protect_at': round(protect_at, 2),
        'what_changes': what_changes,
        'pnl': round(pnl, 2),
        'pnl_pct': round(pnl_pct, 2),
    }


@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'service': 'StockSage Analysis API'})


@app.route('/analyse')
def analyse():
    symbol = request.args.get('symbol', '').strip()
    if not symbol:
        return jsonify({'error': 'symbol is required'}), 400

    entry_price = request.args.get('entry_price', type=float)
    quantity = request.args.get('quantity', type=int)

    try:
        analysis = analyse_stock(symbol)
        if analysis is None:
            return jsonify({'error': f'Could not load data for {symbol.upper()}. Verify the NSE symbol is correct.'}), 404

        result = {'analysis': analysis}

        if entry_price is not None and quantity is not None and entry_price > 0 and quantity > 0:
            result['verdict'] = compute_verdict(analysis, entry_price, quantity)

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
