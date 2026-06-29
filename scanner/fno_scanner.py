"""
Fetches NIFTY/BANKNIFTY option chain from Yahoo Finance.
Yahoo has full NSE OI + LTP data and is accessible from GitHub Actions.
Writes data/fno.json committed to GitHub, served to the app.
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent.parent / 'data'
FNO_FILE = DATA_DIR / 'fno.json'

SYMBOLS = {
    'NIFTY':     {'yahoo': '^NSEI',   'lot': 75,  'step': 50},
    'BANKNIFTY': {'yahoo': '^NSEBANK','lot': 30,  'step': 100},
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}


def fetch_yahoo_options(ticker: str) -> dict:
    """Fetch option chain from Yahoo Finance v8 API."""
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{requests.utils.quote(ticker)}'
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    chart = r.json()['chart']['result'][0]
    quote = chart['meta']
    price = quote.get('regularMarketPrice', 0)
    prev  = quote.get('previousClose', price)
    change = round(price - prev, 2)
    change_pct = round((change / prev) * 100, 2) if prev else 0

    # Fetch option chain
    opt_url = f'https://query1.finance.yahoo.com/v8/finance/options/{requests.utils.quote(ticker)}'
    r2 = requests.get(opt_url, headers=HEADERS, timeout=15)
    r2.raise_for_status()
    data = r2.json()
    result = data.get('optionChain', {}).get('result', [])
    if not result:
        return {'price': price, 'change': change, 'change_pct': change_pct,
                'expiry': 'Weekly', 'options': []}

    # Use nearest expiry
    chain   = result[0]
    expiry_ts = chain.get('expirationDates', [None])[0]
    expiry_str = (datetime.utcfromtimestamp(expiry_ts).strftime('%d-%b-%Y').upper()
                  if expiry_ts else 'Weekly')
    options = chain.get('options', [{}])[0]
    calls   = options.get('calls', [])
    puts    = options.get('puts',  [])

    return {
        'price':      price,
        'change':     change,
        'change_pct': change_pct,
        'expiry':     expiry_str,
        'calls':      calls,
        'puts':       puts,
    }


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


def analyze(symbol: str, cfg: dict) -> dict:
    raw = fetch_yahoo_options(cfg['yahoo'])
    price  = raw['price']
    step   = cfg['step']
    lot    = cfg['lot']
    expiry = raw['expiry']

    calls = raw.get('calls', [])
    puts  = raw.get('puts',  [])

    # Build strike map
    strike_map: dict[int, dict] = {}
    for c in calls:
        k = int(c.get('strike', 0))
        if k not in strike_map:
            strike_map[k] = {'calls_oi': 0, 'puts_oi': 0,
                              'calls_ltp': 0.0, 'puts_ltp': 0.0, 'calls_iv': 0.0}
        strike_map[k]['calls_oi']  = c.get('openInterest', 0)
        strike_map[k]['calls_ltp'] = c.get('lastPrice', 0.0)
        strike_map[k]['calls_iv']  = c.get('impliedVolatility', 0.0) * 100

    for p in puts:
        k = int(p.get('strike', 0))
        if k not in strike_map:
            strike_map[k] = {'calls_oi': 0, 'puts_oi': 0,
                              'calls_ltp': 0.0, 'puts_ltp': 0.0, 'calls_iv': 0.0}
        strike_map[k]['puts_oi']  = p.get('openInterest', 0)
        strike_map[k]['puts_ltp'] = p.get('lastPrice', 0.0)

    if not strike_map:
        raise RuntimeError(f'No option data for {symbol}')

    strikes = sorted(strike_map.keys())
    atm     = min(strikes, key=lambda k: abs(k - price))

    # PCR
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
    nearby_oi    = sum(strike_map.get(k, {}).get('calls_oi', 0) +
                       strike_map.get(k, {}).get('puts_oi', 0)
                       for k in [atm - step, atm, atm + step])
    zone_strength = min(90, int(40 + min(30, abs(pcr - 1.0) * 30) + min(20, nearby_oi / 5000)))
    time_align    = min(90, int(zone_strength * 0.6 + abs(pcr - 1.0) * 15))
    probability   = min(85, max(45, int(zone_strength * 0.5 + time_align * 0.3 +
                                        abs(pcr - 1.0) * 10 * 0.2)))

    # IV
    atm_iv   = strike_map.get(atm, {}).get('calls_iv', 20)
    iv_rank  = min(100, max(0, int(((atm_iv - 10) / 30) * 100)))
    iv_label = 'CHEAP' if iv_rank < 30 else 'EXPENSIVE' if iv_rank > 65 else 'MODERATE'

    suggested_strike = (atm + step if is_bull else atm - step) if iv_rank > 60 else atm

    # Real LTP from Yahoo
    def get_ltp(strike, call=True):
        key = 'calls_ltp' if call else 'puts_ltp'
        ltp = strike_map.get(strike, {}).get(key, 0.0)
        if not ltp:
            ltp = strike_map.get(atm, {}).get(key, 0.0)
        return round(float(ltp), 1)

    premium    = get_ltp(suggested_strike, is_bull)
    entry_low  = round(premium * 0.95, 1)
    entry_high = round(premium * 1.05, 1)
    prem_sl    = round(premium * 0.70, 1)
    prem_tgt   = round(premium * 1.60, 1)
    stop_loss  = int(demand_zone['low'] - step if is_bull else supply_zone['high'] + step)
    target_lvl = int(supply_zone['low']        if is_bull else demand_zone['high'])

    # OI heatmap
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
    oi_analysis = (f'Max CALL OI at {max_call_strike} (resistance). '
                   f'Max PUT OI at {max_put_strike} (support). {pcr_text}. Max Pain: {max_pain}')

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
        'nearest_expiry':      expiry,
        'time_window':         'GOOD',
        'zone_strength':       zone_strength,
        'psychology_signals':  [],
        'timeframe_alignment': time_align,
        'oi_analysis':         oi_analysis,
        'change':              raw['change'],
        'change_pct':          raw['change_pct'],
        'oi_data':             oi_data,
        'signal': {
            'option_name':    f'{symbol} {suggested_strike} {"CE" if is_bull else "PE"}',
            'action':         'BUY CALL' if is_bull else 'BUY PUT',
            'expiry':         expiry,
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

    print('F&O Scanner: fetching from Yahoo Finance...')
    result  = {'timestamp': now_ist, 'source': 'yahoo'}
    success = False

    for symbol, cfg in SYMBOLS.items():
        try:
            data = analyze(symbol, cfg)
            result[symbol.lower()] = data
            print(f'  ✅ {symbol}: {data["current_level"]} | {data["direction"]} | '
                  f'PCR {data["pcr"]} | {data["signal"]["option_name"]} LTP ₹{data["signal"]["premium"]}')
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
