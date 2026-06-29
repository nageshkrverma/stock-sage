"""
Fetches real NSE option chain for NIFTY and BANKNIFTY.
Writes data/fno.json which is committed to GitHub and served to the app.
"""

import json
import time
import sys
from pathlib import Path
from datetime import datetime, timezone

import requests

DATA_DIR = Path(__file__).parent.parent / 'data'
FNO_FILE = DATA_DIR / 'fno.json'

NSE_HOME    = 'https://www.nseindia.com'
NSE_OC_URL  = 'https://www.nseindia.com/api/option-chain-indices?symbol={symbol}'
NSE_HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer':         'https://www.nseindia.com/option-chain',
    'Connection':      'keep-alive',
}


def get_nse_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({
        'User-Agent':      NSE_HEADERS['User-Agent'],
        'Accept-Language': NSE_HEADERS['Accept-Language'],
    })
    try:
        session.get(NSE_HOME, timeout=12)
        time.sleep(1.2)
        session.get(f'{NSE_HOME}/option-chain', timeout=12)
        time.sleep(0.5)
    except Exception as e:
        print(f'  NSE session warning: {e}', file=sys.stderr)
    return session


def fetch_option_chain(symbol: str, session: requests.Session) -> dict:
    resp = session.get(NSE_OC_URL.format(symbol=symbol), headers=NSE_HEADERS, timeout=20)
    if resp.status_code != 200:
        raise RuntimeError(f'NSE returned {resp.status_code} for {symbol}')
    return resp.json()


def calc_max_pain(strike_map: dict, strikes: list) -> int:
    min_loss, max_pain = float('inf'), strikes[0]
    for expiry in strikes:
        loss = sum(
            (expiry - k) * strike_map[k]['calls_oi'] if expiry > k else
            (k - expiry) * strike_map[k]['puts_oi']  if expiry < k else 0
            for k in strikes
        )
        if loss < min_loss:
            min_loss, max_pain = loss, expiry
    return max_pain


def analyze_symbol(symbol: str, session: requests.Session) -> dict:
    chain        = fetch_option_chain(symbol, session)
    records      = chain.get('records', {})
    all_data     = records.get('data', [])
    current_level = records.get('underlyingValue', 0)

    # Get nearest weekly expiry
    expiry_dates = sorted(set(r['expiryDate'] for r in all_data if r.get('expiryDate')))
    nearest_expiry = expiry_dates[0] if expiry_dates else 'Weekly'

    # Build strike map for nearest expiry only
    strike_map = {}
    for row in all_data:
        if row.get('expiryDate') != nearest_expiry:
            continue
        k = row.get('strikePrice', 0)
        if k not in strike_map:
            strike_map[k] = {'calls_oi': 0, 'puts_oi': 0, 'calls_iv': 0.0,
                              'puts_iv': 0.0, 'calls_ltp': 0.0, 'puts_ltp': 0.0}
        if row.get('CE'):
            ce = row['CE']
            strike_map[k]['calls_oi']  += ce.get('openInterest', 0)
            strike_map[k]['calls_iv']   = ce.get('impliedVolatility', 0.0)
            strike_map[k]['calls_ltp']  = ce.get('lastPrice', 0.0)
        if row.get('PE'):
            pe = row['PE']
            strike_map[k]['puts_oi']   += pe.get('openInterest', 0)
            strike_map[k]['puts_iv']    = pe.get('impliedVolatility', 0.0)
            strike_map[k]['puts_ltp']   = pe.get('lastPrice', 0.0)

    if not strike_map:
        raise RuntimeError('No option data found')

    strikes  = sorted(strike_map.keys())
    step     = 50 if symbol == 'NIFTY' else 100
    lot_size = 75 if symbol == 'NIFTY' else 30
    atm      = min(strikes, key=lambda k: abs(k - current_level))

    # PCR
    total_call_oi = sum(v['calls_oi'] for v in strike_map.values())
    total_put_oi  = sum(v['puts_oi']  for v in strike_map.values())
    pcr = round(total_put_oi / total_call_oi, 2) if total_call_oi > 0 else 1.0

    max_pain = calc_max_pain(strike_map, strikes)

    # Zones — highest OI below (demand) and above (supply) current level
    below = [k for k in strikes if k < current_level]
    above = [k for k in strikes if k > current_level]
    demand_strike = max(below, key=lambda k: strike_map[k]['puts_oi'],  default=atm - step)
    supply_strike = max(above, key=lambda k: strike_map[k]['calls_oi'], default=atm + step)
    demand_zone = {'low': demand_strike - step, 'high': demand_strike + step}
    supply_zone = {'low': supply_strike - step, 'high': supply_strike + step}

    # Direction
    if   pcr > 1.2: direction = 'CALL'
    elif pcr < 0.8: direction = 'PUT'
    else:           direction = 'CALL' if (current_level - demand_zone['high']) < (supply_zone['low'] - current_level) else 'PUT'
    is_bull = direction == 'CALL'

    # Zone strength & probability
    nearby_oi = sum(
        strike_map.get(k, {}).get('calls_oi', 0) + strike_map.get(k, {}).get('puts_oi', 0)
        for k in [atm - step, atm, atm + step]
    )
    zone_strength = min(90, int(40 + min(30, abs(pcr - 1.0) * 30) + min(40, nearby_oi / 50000)))
    time_align    = min(90, int(zone_strength * 0.6 + abs(pcr - 1.0) * 15))
    probability   = min(85, max(45, int(zone_strength * 0.5 + time_align * 0.3 + abs(pcr - 1.0) * 10 * 0.2)))

    # IV rank
    atm_iv   = (strike_map[atm]['calls_iv'] + strike_map[atm]['puts_iv']) / 2 if atm in strike_map else 20
    iv_rank  = min(100, max(0, int(((atm_iv - 10) / 30) * 100)))
    iv_label = 'CHEAP' if iv_rank < 30 else 'EXPENSIVE' if iv_rank > 65 else 'MODERATE'

    # Suggested strike
    suggested_strike = (atm + step if is_bull else atm - step) if iv_rank > 60 else atm

    # Real premium (LTP)
    def get_ltp(strike, call=True):
        entry = strike_map.get(strike, {})
        ltp = entry.get('calls_ltp' if call else 'puts_ltp', 0.0)
        if not ltp:  # fallback to ATM
            ltp = strike_map.get(atm, {}).get('calls_ltp' if call else 'puts_ltp', 0.0)
        return round(ltp, 1)

    premium    = get_ltp(suggested_strike, is_bull)
    entry_low  = round(premium * 0.95, 1)
    entry_high = round(premium * 1.05, 1)
    prem_sl    = round(premium * 0.70, 1)
    prem_tgt   = round(premium * 1.60, 1)

    stop_loss = int(demand_zone['low'] - step if is_bull else supply_zone['high'] + step)
    target    = int(supply_zone['low']        if is_bull else demand_zone['high'])

    # OI heatmap data
    oi_range = current_level * 0.08
    oi_data  = [
        {'strike': k, 'calls_oi': strike_map[k]['calls_oi'], 'puts_oi': strike_map[k]['puts_oi']}
        for k in strikes if abs(k - current_level) <= oi_range
    ]

    # OI analysis text
    max_call_strike = max(strikes, key=lambda k: strike_map[k]['calls_oi'])
    max_put_strike  = max(strikes, key=lambda k: strike_map[k]['puts_oi'])
    pcr_text = (f'PCR {pcr} — heavy PUT writing, bullish bias' if pcr > 1.2
                else f'PCR {pcr} — heavy CALL writing, bearish bias' if pcr < 0.8
                else f'PCR {pcr} — neutral, watch price action')
    oi_analysis = (f'Max CALL OI at {max_call_strike} (resistance). '
                   f'Max PUT OI at {max_put_strike} (support). {pcr_text}. Max Pain: {max_pain}')

    return {
        'current_level':       current_level,
        'direction':           direction,
        'probability':         probability,
        'demand_zone':         demand_zone,
        'supply_zone':         supply_zone,
        'stop_loss':           stop_loss,
        'target':              target,
        'suggested_strike':    suggested_strike,
        'strike_type':         'ATM' if suggested_strike == atm else 'Slightly OTM',
        'iv_rank':             iv_rank,
        'iv_label':            iv_label,
        'pcr':                 pcr,
        'pcr_label':           'BULLISH' if pcr >= 1.0 else 'BEARISH',
        'max_pain':            max_pain,
        'nearest_expiry':      nearest_expiry,
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
            'expiry':         nearest_expiry,
            'lot_size':       lot_size,
            'premium':        premium,
            'entry_low':      entry_low,
            'entry_high':     entry_high,
            'sl':             prem_sl,
            'target':         prem_tgt,
            'risk_per_lot':   round((premium - prem_sl)  * lot_size),
            'reward_per_lot': round((prem_tgt - premium) * lot_size),
            'rr_ratio':       '1:2',
        },
    }


def run_fno_scan() -> bool:
    """Fetch NIFTY + BANKNIFTY option chain, write data/fno.json. Returns True on success."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now_ist = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+05:30')

    print('F&O Scanner: connecting to NSE...')
    try:
        session = get_nse_session()
    except Exception as e:
        print(f'  Session error: {e}', file=sys.stderr)
        return False

    result = {'timestamp': now_ist, 'source': 'nse'}
    success = False

    for symbol in ['NIFTY', 'BANKNIFTY']:
        try:
            data = analyze_symbol(symbol, session)
            result[symbol.lower()] = data
            print(f'  ✅ {symbol}: {data["current_level"]} | {data["direction"]} | PCR {data["pcr"]} | {data["signal"]["option_name"]} LTP ₹{data["signal"]["premium"]}')
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
