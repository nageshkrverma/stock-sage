import json
import time
import sys
from datetime import datetime, timezone
from pathlib import Path

from data_fetcher import get_nse_stock_list
from signal_generator import generate_signals_for_stock
from sheet_logger import log_signals_to_sheet, update_signal_statuses
from fno_scanner import run_fno_scan

DATA_DIR = Path(__file__).parent.parent / "data"
SIGNALS_FILE = DATA_DIR / "signals.json"
HISTORY_FILE = DATA_DIR / "signals_history.json"
HISTORY_DAYS = 90


def load_history():
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def save_history(history):
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def prune_history(history, days=HISTORY_DAYS):
    cutoff = datetime.now(timezone.utc).timestamp() - days * 86400
    return [
        entry for entry in history
        if datetime.fromisoformat(entry.get("generated_at", "2000-01-01T00:00:00+00:00")).timestamp() > cutoff
    ]


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    start_time = time.time()
    now = datetime.now(timezone.utc)
    market_date = now.strftime("%Y-%m-%d")

    print(f"StockSage Scanner starting at {now.isoformat()}")

    symbols = get_nse_stock_list()
    print(f"Scanning {len(symbols)} stocks...")

    all_signals = []
    errors = []

    for idx, symbol in enumerate(symbols, 1):
        try:
            signals = generate_signals_for_stock(symbol)
            all_signals.extend(signals)
            if signals:
                print(f"  [{idx}/{len(symbols)}] {symbol}: {len(signals)} signal(s)")
            else:
                pass  # silent skip for no-signal stocks
        except Exception as e:
            errors.append({"symbol": symbol, "error": str(e)})
            print(f"  [{idx}/{len(symbols)}] {symbol}: ERROR — {e}", file=sys.stderr)

        time.sleep(0.3)

    all_signals.sort(key=lambda s: s["confidence"], reverse=True)

    # Deduplicate: keep only the highest-confidence signal per symbol
    seen = set()
    deduped = []
    for sig in all_signals:
        if sig["symbol"] not in seen:
            seen.add(sig["symbol"])
            deduped.append(sig)
    all_signals = deduped

    output = {
        "generated_at": now.isoformat(),
        "market_date": market_date,
        "total_signals": len(all_signals),
        "total_scanned": len(symbols),
        "errors": len(errors),
        "signals": all_signals,
    }

    with open(SIGNALS_FILE, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved {len(all_signals)} signals to {SIGNALS_FILE}")

    # F&O scan — real NSE option chain data
    print("\nRunning F&O scan...")
    try:
        run_fno_scan()
    except Exception as e:
        print(f"  F&O scan skipped: {e}", file=sys.stderr)

    # Log to Google Sheet and update existing signal statuses
    print("\nLogging to Google Sheet...")
    try:
        sheet_logged = log_signals_to_sheet(all_signals)
        print(f"  Logged {sheet_logged} new signals to tracker sheet")
    except Exception as e:
        print(f"  Sheet logging skipped: {e}", file=sys.stderr)

    try:
        update_signal_statuses()
    except Exception as e:
        print(f"  Status update skipped: {e}", file=sys.stderr)

    # Update history
    history = load_history()
    history.extend(all_signals)
    history = prune_history(history)
    save_history(history)
    print(f"History now contains {len(history)} signals (last {HISTORY_DAYS} days)")

    elapsed = time.time() - start_time
    print(f"\nSummary:")
    print(f"  Stocks scanned : {len(symbols)}")
    print(f"  Signals found  : {len(all_signals)}")
    print(f"  Errors         : {len(errors)}")
    print(f"  Time taken     : {elapsed:.1f}s")


if __name__ == "__main__":
    main()
