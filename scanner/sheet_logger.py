"""
Logs signals to the Google Sheet via GAS web app endpoints.
Call log_signals_to_sheet() after each scan run.
"""

import requests
from datetime import datetime

GAS_URL = "https://script.google.com/macros/s/AKfycbzuE5GCyg9PYBcRyOuN3nY-TRXRfWAEWMjYKx8j5AuXk3yoAcukHo5vqBVQZhQuRpIW_A/exec"
CONFIDENCE_THRESHOLD = 50


def log_signals_to_sheet(signals: list) -> int:
    """Log new signals (confidence >= 50) to Stock Signal Tracker. Returns count logged."""
    today = datetime.now().strftime('%d-%m-%Y')
    logged = 0

    for sig in signals:
        if sig.get('confidence', 0) < CONFIDENCE_THRESHOLD:
            continue

        targets = sig.get('targets', [])
        t1 = targets[0]['price'] if len(targets) > 0 else 0
        t2 = targets[1]['price'] if len(targets) > 1 else t1

        psych_labels = []
        for p in sig.get('psychology', []):
            label = p.get('label') or p.get('type', '')
            if label:
                psych_labels.append(label)

        params = {
            'action':      'logSignal',
            'signal_date': today,
            'symbol':      sig.get('symbol', ''),
            'name':        sig.get('name', ''),
            'sector':      sig.get('sector', ''),
            'signal_type': sig.get('signal_type', 'BUY'),
            'holding':     sig.get('holding_period', '30D'),
            'probability': sig.get('confidence', 0),
            'entry_low':   sig.get('entry', {}).get('low', 0),
            'entry_high':  sig.get('entry', {}).get('high', 0),
            'stop_loss':   sig.get('stop_loss', 0),
            'target1':     t1,
            'target2':     t2,
            'psychology':  ', '.join(psych_labels),
            'confidence':  sig.get('confidence', 0),
        }

        try:
            resp = requests.get(GAS_URL, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                if data.get('ok') and not data.get('skipped'):
                    logged += 1
                    print(f"  ✅ Logged {sig['symbol']} to sheet")
                elif data.get('skipped'):
                    print(f"  ⏭  Skipped {sig['symbol']} ({data.get('reason', '')})")
        except Exception as e:
            print(f"  ❌ Sheet log error for {sig.get('symbol', '?')}: {e}")

    return logged


def update_signal_statuses() -> int:
    """Trigger GAS to update all open signal statuses. Returns count updated."""
    try:
        resp = requests.get(GAS_URL, params={'action': 'updateSignals'}, timeout=180)
        if resp.status_code == 200:
            data = resp.json()
            count = data.get('updated', 0)
            print(f"  📊 Updated {count} signal statuses in sheet")
            return count
    except Exception as e:
        print(f"  ❌ Status update error: {e}")
    return 0


def setup_tracker_sheets() -> bool:
    """One-time call to create the tracker tabs in the Google Sheet."""
    try:
        resp = requests.get(GAS_URL, params={'action': 'setupSheets'}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            print(f"  📋 Sheet setup: {data.get('message', data)}")
            return data.get('ok', False)
    except Exception as e:
        print(f"  ❌ Sheet setup error: {e}")
    return False


def install_triggers() -> bool:
    """Register GAS time-based triggers (run once after deployment)."""
    try:
        resp = requests.get(GAS_URL, params={'action': 'installTriggers'}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            print(f"  ⏰ Triggers installed: {data}")
            return data.get('ok', False)
    except Exception as e:
        print(f"  ❌ Trigger install error: {e}")
    return False
