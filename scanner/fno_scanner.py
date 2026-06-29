"""
Fetches real NSE option chain for NIFTY/BANKNIFTY via Upstox API v2.
Real OI, real LTP, real PCR, real expiry dates.
Writes data/fno.json committed to GitHub, served to the app.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent.parent / 'data'
FNO_FILE = DATA_DIR / 'fno.json'

BASE_URL = 'https://api.upstox.com/v2'

SYMBOLS = {
    'NIFTY':     {'key': 'NSE_INDEX|Nifty 50',   'lot': 75,  'step': 50},
    'BANKNIFTY': {'key': 'NSE_INDEX|Nifty Bank',  'lot': 30,  'step': 100},
}


def get_headers(token: str) -> dict:
    return {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json',
    }


def get_expiry_dates(instrument_key: str, token: str) -> list[str]:
    resp = requests.get(
        f'{BASE_URL}/option/contract',
        params={'instrument_key': instrument_key},
        headers=get_headers(token),
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json().get('data', [])
    dates = sorted(set(d['expiry'] for d in data if d.get('expiry')))
    return dates


def get_option_chain(instrument_key: str, expiry: str, token: str) -> dict:
    resp = requests.get(
        f'{BASE_URL}/option/chain',
        params={'instrument_key': instrument_key, 'expiry_date': expiry},
        headers=get_headers(token),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get('data', [])


def get_ltp(instrument_key: str, token: str) -> float:
    resp = requests.get(
        f'{BASE_URL}/market-quote/ltp',
        params={'instrument_key': instrument_key},
        headers=get_headers(token),
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json().get('data', {})
    # key format varies — grab first value
    for v in data.values():
        return float(v.get('last_price', 0))
    return 0.0


def calc_max_pain(strike_map: dict, strikes: list) -> int:
    min_loss, max_pain = float('inf'), strikes[0]
    for exp in strikes:
        loss = sum(
            max(0, exp - k) * v['calls_oi'] + max(0, k - exp) * v['puts_oi']
            for k, v in strike_map.items()
        )
        if loss < min_loss:
            min_loss, max_pain = loss, exp
    return max_pain


def analyze(symbol: str, cfg: dict, token: str) -> dict:
    step = cfg['step']
    lot  = cfg['lot']
    key  = cfg['key']

    # Real current price
    price = get_ltp(key, token)
    if not price:
        raise RuntimeError(f'No LTP for {symbol}')

    # Nearest expiry
    expiry_dates = get_expiry_dates(key, token)
    if not expiry_dates:
        raise RuntimeError(f'No expiry dates for {symbol}')
    nearest_expiry = expiry_dates[0]  # format: YYYY-MM-DD

    # Friendly expiry display
    try:
        expiry_fmt = datetime.strptime(nearest_expiry, '%Y-%m-%d').strftime('%d-%b-%Y').upper()
    except Exception:
        expiry_fmt = nearest_expiry

    # Real option chain
    chain_data = get_option_chain(key, nearest_expiry, token)

    # Build strike map
    strike_map: dict[int, dict] = {}
    for row in chain_data:
        k = int(row.get('strike_price', 0))
        if not k:
            continue
        strike_map.setdefault(k, {'calls_oi': 0, 'puts_oi': 0,
                                   'calls_ltp': 0.0, 'puts_ltp': 0.0, 'calls_iv': 0.0})
        ce = row.get('call_options', {})
        pe = row.get('put_options',  {})
        if ce:
            md = ce.get('market_data', {})
            strike_map[k]['calls_oi']  = int(md.get('oi', 0) or 0)
            strike_map[k]['calls_ltp'] = float(md.get('ltp', 0.0) or 0.0)
            strike_map[k]['calls_iv']  = float(ce.get('option_greeks', {}).get('iv', 0.0) or 0.0)
        if pe:
            md = pe.get('market_data', {})
            strike_map[k]['puts_oi']  = int(md.get('oi', 0) or 0)
            strike_map[k]['puts_ltp'] = float(md.get('ltp', 0.0) or 0.0)

    if not strike_map:
        raise RuntimeError(f'Empty option chain for {symbol}')

    strikes = sorted(strike_map.keys())
    atm     = min(strikes, key=lambda k: abs(k - price))

    # Real PCR
    total_call_oi = sum(v['calls_oi'] for v in strike_map.values())
    total_put_oi  = sum(v['puts_oi']  for v in strike_map.values())
    pcr = round(total_put_oi / total_call_oi, 2) if total_call_oi > 0 else 1.0

    max_pain = calc_max_pain(strike_map, strikes)

    # Zones
    below = [k for k in strikes if k < price]
    above = [k for k in strikes if k > price]
    demand_strike = max(below, key=lambda k: strike_map[k]['puts_oi'],  default=atm - step)
    supply_strike = max(above, key=lambda k: strike_map[k]['calls_oi'], default=atm + step)
    demand_zone = {'low': demand_strike - step, 'high': demand_strike + step}
    supply_zone = {'low': supply_strike - step, 'high': supply_strike + step}

    # Direction
    if   pcr > 1.2: direction = 'CALL'
    elif pcr < 0.8: direction = 'PUT'
    else:           direction = ('CALL' if (price - demand_zone['high']) <
                                           (supply_zone['low'] - price) else 'PUT')
    is_bull = direction == 'CALL'

    # Scores
    nearby_oi     = sum(strike_map.get(k, {}).get('calls_oi', 0) +
                        strike_map.get(k, {}).get('puts_oi', 0)
                        for k in [atm - step, atm, atm + step])
    zone_strength = min(90, int(40 + min(30, abs(pcr - 1.0) * 30) + min(20, nearby_oi / 50000)))
    time_align    = min(90, int(zone_strength * 0.6 + abs(pcr - 1.0) * 15))
    probability   = min(85, max(45, int(zone_strength * 0.5 + time_align * 0.3 +
                                        abs(pcr - 1.0) * 10 * 0.2)))

    # IV
    atm_iv   = strike_map.get(atm, {}).get('calls_iv', 20.0)
    iv_rank  = min(100, max(0, int(((atm_iv - 10) / 30) * 100)))
    iv_label = 'CHEAP' if iv_rank < 30 else 'EXPENSIVE' if iv_rank > 65 else 'MODERATE'

    suggested_strike = (atm + step if is_bull else atm - step) if iv_rank > 60 else atm

    def get_real_ltp(strike, call=True):
        key2 = 'calls_ltp' if call else 'puts_ltp'
        ltp  = strike_map.get(strike, {}).get(key2, 0.0)
        if not ltp:
            ltp = strike_map.get(atm, {}).get(key2, 0.0)
        return round(float(ltp), 1)

    premium    = get_real_ltp(suggested_strike, is_bull)
    entry_low  = round(premium * 0.95, 1)
    entry_high = round(premium * 1.05, 1)
    prem_sl    = round(premium * 0.70, 1)
    prem_tgt   = round(premium * 1.60, 1)
    stop_loss  = int(demand_zone['low'] - step if is_bull else supply_zone['high'] + step)
    target_lvl = int(supply_zone['low']        if is_bull else demand_zone['high'])

    oi_range = price * 0.06
    oi_data  = [
        {'strike': k, 'calls_oi': strike_map[k]['calls_oi'], 'puts_oi': strike_map[k]['puts_oi']}
        for k in strikes if abs(k - price) <= oi_range
    ]

    max_call_strike = max(strikes, key=lambda k: strike_map[k]['calls_oi'])
    max_put_strike  = max(strikes, key=lambda k: strike_map[k]['puts_oi'])
    pcr_text = (f'PCR {pcr} — heavy PUT writing, bullish bias' if pcr > 1.2
                else f'PCR {pcr} — heavy CALL writing, bearish bias' if pcr < 0.8
                else f'PCR {pcr} — neutral, watch price action')
    oi_analysis = (f'Max CALL OI at {max_call_strike:,} (resistance). '
                   f'Max PUT OI at {max_put_strike:,} (support). {pcr_text}. '
                   f'Max Pain: {max_pain:,}')

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
        'pcr_label':           'BULLISH' if pcr >= 1.0 else 'BEARISH',
        'max_pain':            max_pain,
        'nearest_expiry':      expiry_fmt,
        'time_window':         'GOOD',
        'zone_strength':       zone_strength,
        'psychology_signals':  [],
        'timeframe_alignment': time_align,
        'oi_analysis':         oi_analysis,
        'change':              0,
        'change_pct':          0,
        'oi_data':             oi_data,
        'signal': {
            'option_name':    f'{symbol} {suggested_strike} {"CE" if is_bull else "PE"}',
            'action':         'BUY CALL' if is_bull else 'BUY PUT',
            'expiry':         expiry_fmt,
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
    token = os.environ.get('UPSTOX_ACCESS_TOKEN', '')
    if not token:
        print('ERROR: UPSTOX_ACCESS_TOKEN not set', file=sys.stderr)
        return False

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now_ist = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+05:30')

    print('F&O Scanner: fetching real NSE data via Upstox API...')
    result  = {'timestamp': now_ist, 'source': 'upstox'}
    success = False

    for symbol, cfg in SYMBOLS.items():
        try:
            data = analyze(symbol, cfg, token)
            result[symbol.lower()] = data
            print(f'  ✅ {symbol}: ₹{data["current_level"]:,} | {data["direction"]} | '
                  f'PCR {data["pcr"]} | {data["signal"]["option_name"]} '
                  f'LTP ₹{data["signal"]["premium"]} | Expiry {data["nearest_expiry"]}')
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
