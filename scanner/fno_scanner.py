"""
Fetches real NIFTY/BANKNIFTY price from Yahoo Finance.
Generates F&O setup via price-action analysis (NSE OI not accessible from cloud IPs).
Writes data/fno.json committed to GitHub, served to the app.
"""

import json
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import yfinance as yf

DATA_DIR = Path(__file__).parent.parent / 'data'
FNO_FILE = DATA_DIR / 'fno.json'

SYMBOLS = {
    'NIFTY':     {'yahoo': '^NSEI',    'lot': 75,  'step': 50},
    'BANKNIFTY': {'yahoo': '^NSEBANK', 'lot': 30,  'step': 100},
}

# Approximate Black-Scholes premium using IV=20% assumption
def estimate_premium(spot: float, strike: float, days_to_expiry: int, iv: float = 0.20) -> float:
    import math
    t = max(days_to_expiry, 1) / 365
    d1 = (math.log(spot / strike) + 0.5 * iv * iv * t) / (iv * math.sqrt(t))
    d2 = d1 - iv * math.sqrt(t)
    # Simple approximation using N(d1) ≈ normal CDF
    def ncdf(x):
        return 0.5 * (1 + math.erf(x / math.sqrt(2)))
    call = spot * ncdf(d1) - strike * ncdf(d2)
    put  = strike * ncdf(-d2) - spot * ncdf(-d1)
    return round(max(call if spot >= strike else put, 1.0), 1)


def nearest_weekly_expiry() -> tuple[str, int]:
    """Return (expiry_str, days_to_expiry) for nearest NSE weekly Thursday."""
    today = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)  # IST
    days_ahead = (3 - today.weekday()) % 7  # Thursday = 3
    if days_ahead == 0 and today.hour >= 15:
        days_ahead = 7
    expiry = today + timedelta(days=days_ahead)
    return expiry.strftime('%d-%b-%Y').upper(), max(days_ahead, 1)


def analyze(symbol: str, cfg: dict) -> dict:
    ticker = yf.Ticker(cfg['yahoo'])
    step   = cfg['step']
    lot    = cfg['lot']

    # Real price from Yahoo
    hist = ticker.history(period='5d', interval='5m')
    if hist.empty:
        raise RuntimeError(f'No price data for {symbol}')

    price  = float(hist['Close'].iloc[-1])
    open_  = float(hist['Open'].iloc[0])  # today's open (approx)
    high_5d = float(hist['High'].max())
    low_5d  = float(hist['Low'].min())

    # Daily change (compare to yesterday close)
    daily = ticker.history(period='2d', interval='1d')
    if len(daily) >= 2:
        prev_close = float(daily['Close'].iloc[-2])
    else:
        prev_close = price
    change     = round(price - prev_close, 2)
    change_pct = round((change / prev_close) * 100, 2) if prev_close else 0

    # ATM strike
    atm = int(round(price / step) * step)

    # Key levels via pivot / recent high-low
    pivot     = round((high_5d + low_5d + price) / 3, 0)
    support1  = round(2 * pivot - high_5d, 0)
    resist1   = round(2 * pivot - low_5d,  0)

    # Round to nearest step
    demand_lo = int(round(support1 / step) * step)
    demand_hi = demand_lo + step
    supply_lo = int(round(resist1  / step) * step)
    supply_hi = supply_lo + step

    demand_zone = {'low': demand_lo, 'high': demand_hi}
    supply_zone = {'low': supply_lo, 'high': supply_hi}

    # Direction from price action
    above_pivot = price > pivot
    near_demand = (price - demand_hi) < (supply_lo - price)
    if above_pivot and near_demand:
        direction = 'CALL'
    elif not above_pivot and not near_demand:
        direction = 'PUT'
    elif change_pct > 0.3:
        direction = 'CALL'
    elif change_pct < -0.3:
        direction = 'PUT'
    else:
        direction = 'CALL' if above_pivot else 'PUT'
    is_bull = direction == 'CALL'

    # Momentum-based PCR estimate
    if change_pct > 0.5:
        pcr, pcr_label = 1.25, 'BULLISH'
    elif change_pct < -0.5:
        pcr, pcr_label = 0.75, 'BEARISH'
    else:
        pcr, pcr_label = 1.0, 'NEUTRAL'

    # Scores
    dist_from_zone = abs(price - (demand_hi if is_bull else supply_lo))
    zone_pct = dist_from_zone / price * 100
    zone_strength = max(45, min(80, int(75 - zone_pct * 5)))
    time_align    = max(45, min(80, int(zone_strength * 0.7 + abs(change_pct) * 5)))
    probability   = max(50, min(80, int(zone_strength * 0.55 + time_align * 0.35)))

    # Estimated IV from 5d range
    range_pct = (high_5d - low_5d) / price * 100
    iv_est    = max(10, min(50, range_pct * 5))
    iv_rank   = min(100, max(0, int(((iv_est - 10) / 30) * 100)))
    iv_label  = 'CHEAP' if iv_rank < 30 else 'EXPENSIVE' if iv_rank > 65 else 'MODERATE'

    suggested_strike = (atm + step if is_bull else atm - step) if iv_rank > 60 else atm

    expiry_str, days = nearest_weekly_expiry()
    premium    = estimate_premium(price, suggested_strike, days, iv_est / 100)
    entry_low  = round(premium * 0.95, 1)
    entry_high = round(premium * 1.05, 1)
    prem_sl    = round(premium * 0.70, 1)
    prem_tgt   = round(premium * 1.60, 1)

    stop_loss  = int(demand_lo - step if is_bull else supply_hi + step)
    target_lvl = int(supply_lo        if is_bull else demand_hi)
    max_pain   = atm  # estimated: max pain ≈ ATM when no OI data

    oi_analysis = (
        f'Price Action Analysis — Real-time price ₹{price:,.0f} | '
        f'5D Range: {low_5d:,.0f}–{high_5d:,.0f} | '
        f'Pivot: {pivot:,.0f} | Demand: {demand_lo}–{demand_hi} | Supply: {supply_lo}–{supply_hi}'
    )

    # OI data placeholder — show ATM ± 4 strikes with estimated OI
    oi_data = []
    for i in range(-4, 5):
        k = atm + i * step
        base = 100000
        dist = abs(i)
        calls_oi = int(base * (1.5 if i > 0 else 1.0) / (dist + 1))
        puts_oi  = int(base * (1.5 if i < 0 else 1.0) / (dist + 1))
        oi_data.append({'strike': k, 'calls_oi': calls_oi, 'puts_oi': puts_oi})

    return {
        'current_level':       round(price, 2),
        'direction':           direction,
        'probability':         probability,
        'demand_zone':         demand_zone,
        'supply_zone':         supply_zone,
        'stop_loss':           stop_loss,
        'target':              target_lvl,
        'suggested_strike':    suggested_strike,
        'strike_type':         'ATM' if suggested_strike == atm else 'Slightly OTM',
        'iv_rank':             iv_rank,
        'iv_label':            iv_label,
        'pcr':                 pcr,
        'pcr_label':           pcr_label,
        'max_pain':            max_pain,
        'nearest_expiry':      expiry_str,
        'time_window':         'GOOD',
        'zone_strength':       zone_strength,
        'psychology_signals':  [],
        'timeframe_alignment': time_align,
        'oi_analysis':         oi_analysis,
        'change':              change,
        'change_pct':          change_pct,
        'oi_data':             oi_data,
        'is_estimated':        True,
        'signal': {
            'option_name':    f'{symbol} {suggested_strike} {"CE" if is_bull else "PE"}',
            'action':         'BUY CALL' if is_bull else 'BUY PUT',
            'expiry':         expiry_str,
            'lot_size':       lot,
            'premium':        premium,
            'entry_low':      entry_low,
            'entry_high':     entry_high,
            'sl':             prem_sl,
            'target':         prem_tgt,
            'risk_per_lot':   round((premium - prem_sl) * lot),
            'reward_per_lot': round((prem_tgt - premium) * lot),
            'rr_ratio':       '1:2',
        },
    }


def run_fno_scan() -> bool:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now_ist = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+05:30')

    print('F&O Scanner: fetching real-time price via Yahoo Finance...')
    result  = {'timestamp': now_ist, 'source': 'yahoo_price_action'}
    success = False

    for symbol, cfg in SYMBOLS.items():
        try:
            data = analyze(symbol, cfg)
            result[symbol.lower()] = data
            print(f'  ✅ {symbol}: ₹{data["current_level"]:,} ({data["change_pct"]:+.2f}%) | '
                  f'{data["direction"]} | {data["signal"]["option_name"]} '
                  f'Est. ₹{data["signal"]["premium"]} | Expiry {data["nearest_expiry"]}')
            success = True
        except Exception as e:
            print(f'  ❌ {symbol}: {e}', file=sys.stderr)
        time.sleep(1)

    if success:
        with open(FNO_FILE, 'w') as f:
            json.dump(result, f, indent=2)
        print(f'  Saved to {FNO_FILE}')

    return success


if __name__ == '__main__':
    ok = run_fno_scan()
    sys.exit(0 if ok else 1)
