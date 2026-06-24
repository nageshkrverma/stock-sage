# StockSage

A personal NSE stock analysis system that scans Nifty 500 stocks for high-probability demand/supply zone setups using market psychology detection. GitHub Actions runs the scanner daily after market close and commits results as JSON. The React Native app reads that JSON to display signals.

---

## Setup Guide

### Step 1 — Fork the repo

Fork this repository to your own GitHub account. The Actions workflow will use your fork to commit signal data.

### Step 2 — Update the GitHub username in the app

Open [`app/constants/config.ts`](app/constants/config.ts) and replace `YOUR_USERNAME` with your actual GitHub username:

```ts
export const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/YOUR_USERNAME/stock-sage/main/data/signals.json'
```

### Step 3 — Enable GitHub Actions

Go to your forked repo → **Actions** tab → click **"I understand my workflows, go ahead and enable them"**.

The workflow runs automatically at **3:45 PM IST (10:15 UTC)** on weekdays, right after NSE market close.

To run manually: Actions → **Stock Scanner** → **Run workflow**.

### Step 4 — Run the mobile app

```bash
cd app
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone (iOS or Android).

---

## Architecture

```
GitHub Actions (cron weekdays 10:15 UTC)
    └── scanner/main.py
        ├── Fetches OHLCV data from yfinance for ~500 NSE stocks
        ├── Detects demand/supply zones (Drop-Base-Rally / Rally-Base-Drop)
        ├── Analyzes market psychology (Liquidity Grab, Capitulation, etc.)
        ├── Generates signals with confidence scores
        └── Commits data/signals.json to repo

React Native App (Expo SDK 51)
    └── Fetches signals.json from GitHub raw URL
        ├── Home: Signal feed with holding period filters
        ├── Scanner: Search + multi-filter signals
        ├── Signal Detail: Full analysis with chart + psychology
        ├── My Trades: Local trade tracker with P&L
        └── Learn: Psychology education guide
```

## Signal Confidence Scoring

| Component            | Max Points |
|----------------------|-----------|
| Zone strength        | 25        |
| Psychology weight    | 25        |
| Candlestick pattern  | 20        |
| Volume confirmation  | 15        |
| Trend alignment      | 10        |
| Risk:Reward ratio    | 5         |
| **Total**            | **100**   |

Only signals with confidence ≥ 65 are shown.

## Psychology Patterns Detected

| Pattern                    | Signal   | Weight |
|----------------------------|----------|--------|
| 🎯 Liquidity Grab          | BUY      | +30    |
| 😨 Capitulation            | BUY      | +25    |
| 🐋 Institutional Accum.    | BUY      | +25    |
| 📤 Distribution            | SELL     | +25    |
| ⚠️ Bull Trap               | SELL     | +20    |
| ⚠️ Bear Trap               | BUY      | +20    |
| 🚫 FOMO Risk (disqualifier)| DISCARD  | -40    |
| 🤑 Euphoria (disqualifier) | DISCARD  | -35    |

## Disclaimer

This tool is for educational and personal research purposes only. It is **not financial advice**. Always do your own research before trading. Past patterns do not guarantee future performance. Trading involves significant risk of loss.
