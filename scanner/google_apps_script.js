// TradingBabaji — Google Apps Script Web App
// Sheet: https://docs.google.com/spreadsheets/d/1a1ltQkmg_c8_844zaoUpChjWwq2jTKYcBMV2DtTUYL0
//
// Deploy as: Execute as ME, Anyone can access (no login required)
//
// Endpoints:
//   ?action=quote&symbol=RELIANCE                                    → live stock price
//   ?action=analyse&symbol=RELIANCE                                  → full analysis
//   ?action=analyse&symbol=RELIANCE&entry_price=2500&quantity=10     → analysis + verdict
//   ?action=registerUser&...                                         → save user profile
//   ?action=submitPayment&...                                        → log UTR payment
//   ?action=logQuery&symbol=X&email=Y                                → log stock search
//   ?action=saveToken&...                                            → save push token
//   ?action=sendSignalAlert&...                                      → push notification
//   ?action=fno                                                      → live F&O setups (NIFTY + BANKNIFTY)
//   ?action=ping                                                     → health check

const SHEET_ID = '1a1ltQkmg_c8_844zaoUpChjWwq2jTKYcBMV2DtTUYL0'

const TAB_USERS    = 'Users'
const TAB_SUBS     = 'Subscriptions'
const TAB_PAYMENTS = 'Payments'
const TAB_QUERIES  = 'QueryLogs'

// ─── Entry point ────────────────────────────────────────────────────────────

function doGet(e) {
  const p = e.parameter
  const action = p.action || 'quote'

  try {
    if (action === 'ping')             return jsonOk({ ok: true, ts: now() })
    if (action === 'fno')              return handleFNO()
    if (action === 'quote')            return jsonOk(handleQuote(p))
    if (action === 'analyse')          return jsonOk(handleAnalyse(p))
    if (action === 'registerUser')     return jsonOk(handleRegisterUser(p))
    if (action === 'submitPayment')    return jsonOk(handlePayment(p))
    if (action === 'logQuery')         return jsonOk(handleLogQuery(p))
    if (action === 'saveToken')        return jsonOk(handleSaveToken(p))
    if (action === 'sendSignalAlert')  return jsonOk(handleSendSignalAlert(p))
    if (action === 'setupSheets')      return jsonOk(handleSetupSheets())
    if (action === 'logSignal')        return jsonOk(handleLogSignal(p))
    if (action === 'updateSignals')    return jsonOk(handleUpdateSignalStatuses())
    if (action === 'logFNOSignal')     return jsonOk(handleLogFNOSignal(p))
    if (action === 'updateFNO')        return jsonOk(handleUpdateFNOStatuses())
    if (action === 'getPerformance')   return jsonOk(handleGetPerformance())
    if (action === 'installTriggers')  return jsonOk(handleInstallTriggers())
    return jsonOk({ error: 'unknown action' })
  } catch (err) {
    return jsonOk({ error: err.message })
  }
}

// ─── Stock Quote ─────────────────────────────────────────────────────────────

function handleQuote(p) {
  const symbol = (p.symbol || '').toUpperCase().trim()
  if (!symbol) return { error: 'symbol required' }
  if (p.email) {
    try { appendRow(TAB_QUERIES, [now(), p.email, symbol]) } catch(_) {}
  }
  return fetchQuote(symbol)
}

function fetchQuote(symbol) {
  const options = {
    method: 'get',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    muteHttpExceptions: true,
  }
  const ticker = symbol.startsWith('^') ? encodeURIComponent(symbol) : `${symbol}.NS`
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
  ]
  for (const url of urls) {
    try {
      const res = UrlFetchApp.fetch(url, options)
      if (res.getResponseCode() === 200) {
        const result = parseYahoo(res.getContentText(), symbol)
        if (!result.error) return result
      }
    } catch(_) {}
  }
  return { error: 'not found', symbol }
}

function parseYahoo(text, symbol) {
  const json = JSON.parse(text)
  const meta = json?.chart?.result?.[0]?.meta
  if (!meta || !meta.regularMarketPrice) return { error: 'no data', symbol }
  const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice
  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    price: meta.regularMarketPrice,
    change: meta.regularMarketPrice - prev,
    changePct: ((meta.regularMarketPrice - prev) / prev) * 100,
    open: meta.regularMarketOpen || meta.regularMarketPrice,
    high: meta.regularMarketDayHigh || meta.regularMarketPrice,
    low: meta.regularMarketDayLow || meta.regularMarketPrice,
    prevClose: prev,
    volume: meta.regularMarketVolume || 0,
    marketCap: meta.marketCap || 0,
    week52High: meta.fiftyTwoWeekHigh || 0,
    week52Low: meta.fiftyTwoWeekLow || 0,
    exchange: 'NSE',
    ts: now(),
  }
}

// ─── Full Stock Analysis ─────────────────────────────────────────────────────
// params: symbol, entry_price (optional), quantity (optional)

function handleAnalyse(p) {
  const symbol = (p.symbol || '').toUpperCase().replace(/\.(NS|BO)$/i, '').trim()
  if (!symbol) return { error: 'symbol required' }

  const entryPrice = p.entry_price ? parseFloat(p.entry_price) : null
  const quantity   = p.quantity    ? parseInt(p.quantity)      : null

  const bars = fetchOHLCVBars(symbol)
  if (!bars || bars.length < 50) return { error: `Could not load price data for ${symbol}. Please verify the NSE symbol.` }

  const quote = fetchQuote(symbol)
  const name         = quote.name    || symbol
  const currentPrice = (quote.price && quote.price > 0) ? quote.price : bars[bars.length - 1].c
  const dayChangePct = quote.changePct || 0

  const analysis = buildAnalysis(symbol, name, currentPrice, dayChangePct, bars)
  const result = { analysis }

  if (entryPrice > 0 && quantity > 0) {
    result.verdict = buildVerdict(analysis, entryPrice, quantity)
  }

  return result
}

// Fetch 1 year of daily OHLCV bars from Yahoo Finance
function fetchOHLCVBars(symbol) {
  const options = { method: 'get', headers: { 'User-Agent': 'Mozilla/5.0' }, muteHttpExceptions: true }
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d&range=1y`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d&range=1y`,
  ]
  for (const url of urls) {
    try {
      const res = UrlFetchApp.fetch(url, options)
      if (res.getResponseCode() !== 200) continue
      const json = JSON.parse(res.getContentText())
      const result = json?.chart?.result?.[0]
      if (!result) continue
      const ts = result.timestamp || []
      const q  = result.indicators?.quote?.[0] || {}
      const bars = []
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i]
        if (o && h && l && c) bars.push({ t: ts[i] * 1000, o, h, l, c, v: v || 0 })
      }
      if (bars.length >= 50) return bars
    } catch(_) {}
  }
  return null
}

// ─── Analysis Builder ─────────────────────────────────────────────────────────

function buildAnalysis(symbol, name, currentPrice, dayChangePct, bars) {
  const atr        = calcATR(bars)
  const rsi        = calcRSI(bars)
  const trend      = getTrendBias(bars)
  const candlestick = detectCandlestick(bars)
  const volume     = getVolumeConfirmation(bars)

  const demandZones = detectDemandZones(bars, atr)
  const supplyZones = detectSupplyZones(bars, atr)

  const demandBelow = demandZones.filter(z => z.top < currentPrice)
  const nearestDemand = demandBelow.length > 0
    ? demandBelow.reduce((best, z) => z.top > best.top ? z : best)
    : (demandZones[0] || null)

  const supplyAbove = supplyZones.filter(z => z.bottom > currentPrice)
  const nearestSupply = supplyAbove.length > 0
    ? supplyAbove.reduce((best, z) => z.bottom < best.bottom ? z : best)
    : (supplyZones[0] || null)

  const { signals: psychology, disqualifiers } = detectPsychology(bars, nearestDemand, nearestSupply, rsi)
  const fearGreed = calcFearGreed(rsi, bars, [...psychology, ...disqualifiers])

  return {
    symbol,
    name,
    sector: 'NSE',
    current_price:        Math.round(currentPrice * 100) / 100,
    trend_bias:           trend,
    rsi,
    volume_confirmation:  volume,
    candlestick_pattern:  candlestick,
    nearest_demand_zone:  nearestDemand,
    nearest_supply_zone:  nearestSupply,
    all_demand_zones:     demandZones.slice(0, 3),
    all_supply_zones:     supplyZones.slice(0, 3),
    psychology,
    disqualifiers,
    fear_greed_position:  fearGreed,
    day_change_pct:       Math.round(dayChangePct * 100) / 100,
  }
}

// ─── Math Utilities ───────────────────────────────────────────────────────────

function calcEMA(values, period) {
  const k = 2 / (period + 1)
  let ema = values[0]
  const result = [ema]
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
    result.push(ema)
  }
  return result
}

function calcRSI(bars, period = 14) {
  const closes = bars.map(b => b.c)
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses -= d
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(0, d))  / period
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period
  }
  if (avgLoss === 0) return 100
  return Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 10) / 10
}

function calcATR(bars, period = 14) {
  const trs = []
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c)
    ))
  }
  const slice = trs.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

// ─── Trend ────────────────────────────────────────────────────────────────────

function getTrendBias(bars) {
  const closes = bars.map(b => b.c)
  const cur = closes[closes.length - 1]
  if (closes.length >= 200) {
    const ema50  = calcEMA(closes, 50)
    const ema200 = calcEMA(closes, 200)
    const e50 = ema50[ema50.length - 1], e200 = ema200[ema200.length - 1]
    if (cur > e50 && e50 > e200) return 'BULLISH'
    if (cur < e50 && e50 < e200) return 'BEARISH'
    return 'NEUTRAL'
  }
  if (closes.length >= 50) {
    const ema50 = calcEMA(closes, 50)
    const e50 = ema50[ema50.length - 1]
    if (cur > e50 * 1.01) return 'BULLISH'
    if (cur < e50 * 0.99) return 'BEARISH'
  }
  return 'NEUTRAL'
}

// ─── Candlestick Pattern ──────────────────────────────────────────────────────

function detectCandlestick(bars) {
  const n = bars.length
  if (n < 3) return null
  const b2 = bars[n - 3], b1 = bars[n - 2], b0 = bars[n - 1]
  const range0 = b0.h - b0.l
  if (range0 === 0) return null
  const body0 = Math.abs(b0.c - b0.o)
  const lower = Math.min(b0.o, b0.c) - b0.l
  const upper = b0.h - Math.max(b0.o, b0.c)

  if (b1.c < b1.o && b0.c > b0.o && b0.o < b1.c && b0.c > b1.o)
    return { pattern: 'Bullish Engulfing', score: 25, bullish: true }
  if (b1.c > b1.o && b0.c < b0.o && b0.o > b1.c && b0.c < b1.o)
    return { pattern: 'Bearish Engulfing', score: 25, bullish: false }
  if (lower > body0 * 2 && upper < body0 * 0.5 && b0.c >= b0.o)
    return { pattern: 'Hammer', score: 20, bullish: true }
  if (upper > body0 * 2 && lower < body0 * 0.5 && b0.c <= b0.o)
    return { pattern: 'Shooting Star', score: 20, bullish: false }
  if (b2.c < b2.o && body0 > (b2.h - b2.l) * 0.5 && b0.c > (b2.o + b2.c) / 2)
    return { pattern: 'Morning Star', score: 30, bullish: true }
  if (body0 < range0 * 0.1)
    return { pattern: 'Doji — market indecision', score: 10, bullish: false }
  return null
}

// ─── Volume Confirmation ──────────────────────────────────────────────────────

function getVolumeConfirmation(bars) {
  const n = bars.length
  const avgVol = bars.slice(-21, -1).reduce((s, b) => s + b.v, 0) / 20
  const ratio  = avgVol > 0 ? Math.round((bars[n - 1].v / avgVol) * 100) / 100 : 1
  return { ratio, confirmed: ratio > 1.5 }
}

// ─── Zone Detection ───────────────────────────────────────────────────────────

function detectDemandZones(bars, atr) {
  const zones = []
  const n = bars.length
  const cur = bars[n - 1].c

  for (let i = 4; i < n - 4; i++) {
    for (let baseLen = 1; baseLen <= 3; baseLen++) {
      if (i + baseLen + 2 >= n) break
      const base    = bars.slice(i, i + baseLen)
      const baseHi  = Math.max(...base.map(b => b.h))
      const baseLo  = Math.min(...base.map(b => b.l))

      if (baseHi - baseLo > atr * 1.5) continue            // too wide

      const prior = bars.slice(i - 3, i)
      if (prior[prior.length - 1].c >= prior[0].c) continue // no prior drop
      if (prior.filter(b => b.c < b.o).length < 2) continue // not mostly bearish

      const postBar = bars[i + baseLen]
      if (postBar.c <= baseHi * 1.005) continue             // no post rally

      if (cur < baseLo * 0.97) continue                     // zone broken long ago

      let touches = 0
      for (let j = i + baseLen + 1; j < n; j++) {
        if (bars[j].l <= baseHi && bars[j].h >= baseLo) touches++
      }

      const impulsePct   = (postBar.c - baseLo) / baseLo * 100
      const recencyDays  = n - i
      const strength = (cur > baseHi ? 40 : 0) +
                       Math.min(30, impulsePct * 2) +
                       Math.max(0, 30 - recencyDays * 0.15)

      zones.push({
        type: 'DEMAND',
        top:            Math.round(baseHi * 100) / 100,
        bottom:         Math.round(baseLo * 100) / 100,
        strength_score: Math.round(Math.min(100, strength) * 10) / 10,
        fresh:          touches === 0,
        origin_date:    new Date(bars[i].t).toISOString().slice(0, 10),
        touches,
      })
      break
    }
  }
  return deduplicateZones(zones).slice(0, 5)
}

function detectSupplyZones(bars, atr) {
  const zones = []
  const n = bars.length
  const cur = bars[n - 1].c

  for (let i = 4; i < n - 4; i++) {
    for (let baseLen = 1; baseLen <= 3; baseLen++) {
      if (i + baseLen + 2 >= n) break
      const base   = bars.slice(i, i + baseLen)
      const baseHi = Math.max(...base.map(b => b.h))
      const baseLo = Math.min(...base.map(b => b.l))

      if (baseHi - baseLo > atr * 1.5) continue

      const prior = bars.slice(i - 3, i)
      if (prior[prior.length - 1].c <= prior[0].c) continue // no prior rally
      if (prior.filter(b => b.c > b.o).length < 2) continue // not mostly bullish

      const postBar = bars[i + baseLen]
      if (postBar.c >= baseLo * 0.995) continue             // no post drop

      if (cur > baseHi * 1.03) continue                     // zone far below price

      let touches = 0
      for (let j = i + baseLen + 1; j < n; j++) {
        if (bars[j].l <= baseHi && bars[j].h >= baseLo) touches++
      }

      const impulsePct  = (baseHi - postBar.c) / baseHi * 100
      const recencyDays = n - i
      const strength = (cur < baseLo ? 40 : 0) +
                       Math.min(30, impulsePct * 2) +
                       Math.max(0, 30 - recencyDays * 0.15)

      zones.push({
        type: 'SUPPLY',
        top:            Math.round(baseHi * 100) / 100,
        bottom:         Math.round(baseLo * 100) / 100,
        strength_score: Math.round(Math.min(100, strength) * 10) / 10,
        fresh:          touches === 0,
        origin_date:    new Date(bars[i].t).toISOString().slice(0, 10),
        touches,
      })
      break
    }
  }
  return deduplicateZones(zones).slice(0, 5)
}

function deduplicateZones(zones) {
  zones.sort((a, b) => b.strength_score - a.strength_score)
  const result = []
  for (const z of zones) {
    const zMid = (z.top + z.bottom) / 2
    if (!result.some(r => Math.abs(zMid - (r.top + r.bottom) / 2) / zMid < 0.02)) {
      result.push(z)
    }
  }
  return result
}

// ─── Psychology Signals ───────────────────────────────────────────────────────

function detectPsychology(bars, nearestDemand, nearestSupply, rsi) {
  const signals = [], disqualifiers = []
  const n  = bars.length
  const b0 = bars[n - 1]
  const cur = b0.c
  const range0 = b0.h - b0.l

  const avgVol20 = bars.slice(-21, -1).reduce((s, b) => s + b.v, 0) / 20
  const avgVol10 = bars.slice(-11, -1).reduce((s, b) => s + b.v, 0) / 10
  const vr20 = avgVol20 > 0 ? b0.v / avgVol20 : 1
  const vr10 = avgVol10 > 0 ? b0.v / avgVol10 : 1
  const lowerWick = Math.min(b0.o, b0.c) - b0.l
  const wickRatio = range0 > 0 ? lowerWick / range0 : 0

  const closes = bars.map(b => b.c)
  const ema200Arr = calcEMA(closes, Math.min(200, closes.length))
  const ema200 = ema200Arr[ema200Arr.length - 1]
  const pctVsEma200 = (cur - ema200) / ema200 * 100

  if (nearestDemand) {
    const zBot = nearestDemand.bottom, zTop = nearestDemand.top
    if (b0.l < zBot * 0.998 && b0.c > zBot && vr20 > 1.5)
      signals.push({ type: 'LIQUIDITY_GRAB', label: '🎯 Liquidity Grab', description: 'Smart money swept retail stop losses below support — reversal high probability', weight: 30 })

    if (wickRatio > 0.55 && vr10 > 2.0)
      signals.push({ type: 'CAPITULATION', label: '😨 Capitulation', description: 'Panic selling absorbed by institutions — accumulation zone active', weight: 25 })

    const prev10 = bars.slice(-10)
    const p10Hi = Math.max(...prev10.map(b => b.h))
    const p10Lo = Math.min(...prev10.map(b => b.l))
    const p10Avg = prev10.reduce((s, b) => s + b.c, 0) / 10
    if (p10Avg > 0 && (p10Hi - p10Lo) / p10Avg * 100 < 3.0 && prev10[9].c > prev10[0].c)
      signals.push({ type: 'SMART_MONEY_ACCUMULATION', label: '🐋 Institutional Accumulation', description: 'Quiet accumulation detected — big players building positions', weight: 25 })

    if (n >= 5) {
      const prev4 = bars.slice(-5, -1)
      if (prev4.some(b => b.l < zBot) && b0.c > zBot && prev4.reduce((s, b) => s + b.v, 0) / 4 < avgVol20 * 0.8)
        signals.push({ type: 'BEAR_TRAP', label: '⚠️ Bear Trap', description: 'False breakdown — shorts trapped, squeeze likely upward', weight: 20 })
    }
  }

  if (nearestSupply) {
    const zTop = nearestSupply.top, zLo = nearestSupply.bottom
    const prev10 = bars.slice(-10)
    const p10Hi = Math.max(...prev10.map(b => b.h))
    const p10Lo = Math.min(...prev10.map(b => b.l))
    const p10Avg = prev10.reduce((s, b) => s + b.c, 0) / 10
    const uwRatios = prev10.map(b => { const r = b.h - b.l; return r > 0 ? (b.h - Math.max(b.o, b.c)) / r : 0 })
    const avgUW = uwRatios.reduce((s, v) => s + v, 0) / 10
    const upBars = prev10.filter(b => b.c > b.o)
    const volDecl = upBars.length >= 2 && upBars[upBars.length - 1].v < upBars[0].v
    if (p10Avg > 0 && (p10Hi - p10Lo) / p10Avg * 100 < 3.0 && avgUW > 0.3 && volDecl)
      signals.push({ type: 'DISTRIBUTION', label: '📤 Distribution', description: 'Smart money offloading positions — supply zone active', weight: 25 })

    if (n >= 5) {
      const prev4 = bars.slice(-5, -1)
      if (prev4.some(b => b.h > zTop) && b0.c < zTop && prev4.reduce((s, b) => s + b.v, 0) / 4 < avgVol20 * 0.8)
        signals.push({ type: 'BULL_TRAP', label: '⚠️ Bull Trap', description: 'False breakout — retail trapped long, reversal likely', weight: 20 })
    }
  }

  // Disqualifiers
  const refTop = nearestDemand ? nearestDemand.top : cur
  const distPct = refTop > 0 ? (cur - refTop) / refTop * 100 : 0
  const last3Vols = [bars[n - 3].v, bars[n - 2].v, bars[n - 1].v]
  if (distPct > 7 && rsi > 72 && last3Vols[0] > last3Vols[1] && last3Vols[1] > last3Vols[2])
    disqualifiers.push({ type: 'FOMO_ZONE', label: '🚫 FOMO Risk', description: 'Price extended — late entry risk, wait for pullback to zone', weight: -40 })

  if (pctVsEma200 > 15 && rsi > 78 && nearestSupply)
    disqualifiers.push({ type: 'EUPHORIA', label: '🤑 Euphoria Zone', description: 'Extreme greed — avoid entry, distribution likely', weight: -35 })

  return { signals, disqualifiers }
}

// ─── Fear & Greed Index ───────────────────────────────────────────────────────

function calcFearGreed(rsi, bars, allPsych) {
  const closes = bars.map(b => b.c)
  const ema200Arr = calcEMA(closes, Math.min(200, closes.length))
  const ema200 = ema200Arr[ema200Arr.length - 1]
  const cur = closes[closes.length - 1]
  const pctVsEma200 = (cur - ema200) / ema200 * 100

  const rsiComp   = Math.max(0, Math.min(1, (rsi - 20) / 80))
  const emaComp   = Math.max(0, Math.min(1, (pctVsEma200 + 20) / 40))
  const psychScore = allPsych.reduce((s, p) => s + p.weight, 0)
  const psychComp = Math.max(0, Math.min(1, (psychScore + 50) / 100))

  return Math.round((rsiComp * 0.4 + emaComp * 0.3 + psychComp * 0.3) * 1000) / 1000
}

// ─── Verdict Engine ───────────────────────────────────────────────────────────

function buildVerdict(analysis, entryPrice, quantity) {
  const cur    = analysis.current_price
  const pnlPct = ((cur - entryPrice) / entryPrice) * 100
  const pnl    = (cur - entryPrice) * quantity

  const trend       = analysis.trend_bias
  const rsi         = analysis.rsi
  const demandZones = analysis.all_demand_zones || []
  const supplyZones = analysis.all_supply_zones || []
  const nd          = analysis.nearest_demand_zone
  const ns          = analysis.nearest_supply_zone
  const psychology  = analysis.psychology || []
  const volume      = analysis.volume_confirmation || {}

  const psychTypes   = new Set(psychology.map(p => p.type))
  const bullishPsych = ['LIQUIDITY_GRAB', 'CAPITULATION', 'SMART_MONEY_ACCUMULATION', 'BEAR_TRAP'].some(t => psychTypes.has(t))
  const allDemandBroken = demandZones.length > 0 && demandZones.every(z => z.bottom > cur)
  const nearDemand  = nd && nd.top <= cur && (cur - nd.top) / cur < 0.05
  const nearSupply  = ns && ns.bottom >= cur && (ns.bottom - cur) / cur < 0.05

  let verdict, summary, protectAt, whatChanges

  if ((allDemandBroken || trend === 'BEARISH') && pnlPct < -8) {
    verdict   = 'EXIT'
    summary   = 'The stock has broken below all key support levels. Protecting your remaining capital is the priority right now — holding further increases your risk.'
    protectAt = cur * 1.01
    whatChanges = [
      nd ? `If price recovers above ₹${nd.top.toFixed(2)} with strong buying volume` : 'If price shows a strong recovery with volume',
      'If the overall market trend shifts back to bullish strongly',
      'If a strong reversal candlestick appears on high volume next session',
    ]
  } else if (nearDemand && bullishPsych && pnlPct >= -8 && pnlPct <= 0) {
    verdict   = 'ADD_MORE'
    summary   = 'The stock is sitting on a strong support zone where big buyers have stepped in before. Your small loss here can be recovered by averaging down carefully.'
    protectAt = nd ? nd.bottom * 0.97 : entryPrice * 0.92
    whatChanges = [
      `Exit immediately if price falls and closes below ₹${(nd ? nd.bottom * 0.97 : entryPrice * 0.92).toFixed(2)}`,
      'If volume dries up significantly, the support may not hold',
      'If the broader market turns sharply negative',
    ]
  } else if (nearSupply && pnlPct > 5) {
    verdict   = 'PARTIAL_EXIT'
    summary   = 'You have a healthy profit and the stock is near a zone where sellers have previously been active. Consider booking a portion of your profits while keeping some to run further.'
    protectAt = nd ? nd.top : entryPrice
    whatChanges = [
      ns ? `If price breaks above ₹${ns.top.toFixed(2)} with strong volume, hold remaining` : 'If price breaks resistance with strong volume, hold remaining',
      'If RSI drops below 45, exit the remaining position',
      'If overall market weakens significantly',
    ]
  } else {
    verdict   = 'HOLD'
    summary   = 'The stock is in a stable position. The trend is intact, support zones are holding, and there is no immediate threat to your position. Patience is the right strategy here.'
    protectAt = nd ? nd.bottom * 0.97 : entryPrice * 0.93
    whatChanges = [
      `Exit if price closes below ₹${protectAt.toFixed(2)} (support broken)`,
      ns ? `Consider booking partial profits near ₹${ns.bottom.toFixed(2)}` : 'Consider booking profits if RSI exceeds 75',
      'Reassess if daily volume drops sharply for 3 or more days',
    ]
  }

  // Factors
  const factors = []
  factors.push({
    icon: trend === 'BULLISH' ? '📈' : trend === 'BEARISH' ? '📉' : '↔️',
    description: trend === 'BULLISH' ? 'The stock is in a healthy upward trend'
      : trend === 'BEARISH' ? 'The stock is in a downward trend — proceed with caution'
      : 'The stock is moving sideways — waiting for direction',
    positive: trend === 'BULLISH',
  })

  if (nd) {
    const distD = (cur - nd.top) / cur * 100
    factors.push({
      icon: '🛡️',
      description: distD < 5
        ? `Support zone is nearby at ₹${nd.top.toFixed(2)} — acting as a safety net`
        : `Support zone is ${distD.toFixed(1)}% below current price — reasonable cushion`,
      positive: distD < 8,
    })
  }

  if (rsi < 35)
    factors.push({ icon: '💚', description: 'Stock is oversold — value buyers are likely to step in soon', positive: true })
  else if (rsi > 70)
    factors.push({ icon: '⚠️', description: 'Stock is overheated — risk of a pullback is higher than usual', positive: false })
  else
    factors.push({ icon: '✅', description: 'Momentum is healthy — not overheated and not oversold', positive: true })

  factors.push({
    icon: pnl >= 0 ? '💰' : '📉',
    description: `Your position is ${pnl >= 0 ? 'up' : 'down'} ₹${Math.abs(pnl).toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`,
    positive: pnl >= 0,
  })

  const bullEntry = psychology.find(p => ['LIQUIDITY_GRAB', 'CAPITULATION', 'SMART_MONEY_ACCUMULATION'].includes(p.type))
  if (bullEntry) {
    factors.push({ icon: '🎯', description: `${bullEntry.label.replace(/^.\s/, '')} detected — institutional buying interest is present`, positive: true })
  }

  factors.push({
    icon: '📊',
    description: volume.confirmed ? 'Trading volume is above average — confirms the price move' : 'Trading volume is below average — price moves lack strong conviction',
    positive: volume.confirmed,
  })

  return {
    verdict,
    summary,
    factors: factors.slice(0, 6),
    protect_at:   Math.round(protectAt * 100) / 100,
    what_changes: whatChanges,
    pnl:          Math.round(pnl * 100) / 100,
    pnl_pct:      Math.round(pnlPct * 100) / 100,
  }
}

// ─── Register User ────────────────────────────────────────────────────────────

function handleRegisterUser(p) {
  const ss = SpreadsheetApp.openById(SHEET_ID)
  const usersSheet = getOrCreateSheet(ss, TAB_USERS, [
    'UID', 'Email', 'Full Name', 'DOB', 'City', 'State', 'Registered At', 'Free Until', 'Plan', 'Updated At'
  ])
  const existing = findRow(usersSheet, 2, p.email)
  if (existing > 0) {
    usersSheet.getRange(existing, 3, 1, 8).setValues([[
      p.fullName, p.dob, p.city, p.state, p.registeredAt, p.freeUntil, p.plan, now()
    ]])
  } else {
    appendRow(TAB_USERS, [p.uid, p.email, p.fullName, p.dob || '', p.city || '', p.state || '', p.registeredAt, p.freeUntil, p.plan || 'trial', now()])
  }
  const subSheet = getOrCreateSheet(ss, TAB_SUBS, ['Email', 'Full Name', 'Plan', 'Trial Start', 'Trial End', 'Paid On', 'Status', 'Updated At'])
  const existingSub = findRow(subSheet, 1, p.email)
  const status = p.plan === 'paid' ? 'Active Paid' : 'Trial'
  if (existingSub > 0) {
    subSheet.getRange(existingSub, 3, 1, 6).setValues([[p.plan, p.registeredAt, p.freeUntil, '', status, now()]])
  } else {
    appendRow(TAB_SUBS, [p.email, p.fullName, p.plan || 'trial', p.registeredAt, p.freeUntil, '', status, now()])
  }
  return { ok: true, message: 'User registered' }
}

// ─── Payment Submission ───────────────────────────────────────────────────────

function handlePayment(p) {
  getOrCreateSheet(SpreadsheetApp.openById(SHEET_ID), TAB_PAYMENTS, [
    'Email', 'Full Name', 'UTR Number', 'Amount', 'Submitted At', 'Status', 'Verified By', 'Verified At'
  ])
  appendRow(TAB_PAYMENTS, [p.email, p.fullName, p.utr, p.amount || '499', p.submittedAt || now(), 'Pending', '', ''])
  return { ok: true, message: 'Payment logged' }
}

// ─── Query Log ────────────────────────────────────────────────────────────────

function handleLogQuery(p) {
  getOrCreateSheet(SpreadsheetApp.openById(SHEET_ID), TAB_QUERIES, ['Timestamp', 'Email', 'Symbol'])
  appendRow(TAB_QUERIES, [now(), p.email || 'guest', (p.symbol || '').toUpperCase()])
  return { ok: true }
}

// ─── Save Push Token ──────────────────────────────────────────────────────────

function handleSaveToken(p) {
  const ss = SpreadsheetApp.openById(SHEET_ID)
  const sheet = getOrCreateSheet(ss, 'PushTokens', ['Email', 'Token', 'Platform', 'Updated At'])
  const existing = findRow(sheet, 1, p.email)
  if (existing > 0) {
    sheet.getRange(existing, 2, 1, 3).setValues([[p.token, p.platform, now()]])
  } else {
    sheet.appendRow([p.email, p.token, p.platform || 'android', now()])
  }
  return { ok: true }
}

// ─── Send Signal Notification ─────────────────────────────────────────────────

function handleSendSignalAlert(p) {
  const ss = SpreadsheetApp.openById(SHEET_ID)
  const sheet = ss.getSheetByName('PushTokens')
  if (!sheet) return { ok: false, reason: 'No tokens yet' }
  const data = sheet.getDataRange().getValues()
  const tokens = []
  for (let i = 1; i < data.length; i++) {
    if (data[i][1]) tokens.push(data[i][1])
  }
  if (tokens.length === 0) return { ok: false, reason: 'No registered tokens' }
  const totalSignals = p.totalSignals || '?'
  const marketDate = p.marketDate || new Date().toLocaleDateString('en-IN')
  const messages = tokens.map(token => ({
    to: token,
    title: '📊 TradingBabaji — New Signals',
    body: `${totalSignals} fresh signals for ${marketDate}. Tap to view!`,
    sound: 'default',
    data: { screen: 'signals' },
    priority: 'high',
  }))
  let sent = 0
  for (let i = 0; i < messages.length; i += 100) {
    const res = UrlFetchApp.fetch('https://exp.host/--/api/v2/push/send', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(messages.slice(i, i + 100)),
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() === 200) sent += Math.min(100, messages.length - i)
  }
  return { ok: true, tokenCount: tokens.length, sent }
}

// ─── F&O Live Setups ──────────────────────────────────────────────────────────

function handleFNO() {
  let step = 'init'
  try {
    step = 'nifty_fetch'
    const nifty     = getFNOSetup('NIFTY')
    step = 'banknifty_fetch'
    const banknifty = getFNOSetup('BANKNIFTY')
    step = 'autolog'

    try {
      if (nifty.probability > 50)     autoLogFNO('NIFTY',     nifty)
      if (banknifty.probability > 50) autoLogFNO('BANKNIFTY', banknifty)
    } catch(_) {}

    step = 'done'
    return jsonOk({ nifty, banknifty, timestamp: now() })
  } catch (err) {
    return jsonOk({ error: err.message, step: step })
  }
}

function autoLogFNO(index, setup) {
  const ist      = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000)
  const dateStr  = Utilities.formatDate(ist, 'UTC', 'dd-MM-yyyy')
  const timeStr  = Utilities.formatDate(ist, 'UTC', 'hh:mm a')
  const isBull   = setup.direction === 'CALL'

  const confluences = []
  if (setup.pcr > 1.1)                               confluences.push('PCR Bullish')
  if (setup.pcr < 0.9)                               confluences.push('PCR Bearish')
  if (setup.iv_label === 'CHEAP')                    confluences.push('Low IV')
  if (setup.zone_strength > 70)                      confluences.push('Strong Zone')
  if (setup.psychology_signals && setup.psychology_signals.length) confluences.push(...setup.psychology_signals.map(s => s.replace(/_/g, ' ')))

  const zoneStr = isBull
    ? `${setup.demand_zone.low} - ${setup.demand_zone.high}`
    : `${setup.supply_zone.low} - ${setup.supply_zone.high}`

  handleLogFNOSignal({
    signal_date:  dateStr,
    signal_time:  timeStr,
    index:        index,
    direction:    setup.direction,
    probability:  setup.probability,
    index_level:  setup.current_level,
    strike:       setup.suggested_strike,
    option_type:  setup.direction === 'CALL' ? 'CE' : 'PE',
    expiry:       'Weekly',
    zone_level:   zoneStr,
    sl_level:     setup.stop_loss,
    target_level: setup.target,
    pcr:          setup.pcr,
    iv_rank:      setup.iv_rank,
    max_pain:     setup.max_pain,
    confluences:  confluences.join(', '),
  })
}

function getFNOSetup(symbol) {
  // NSE is blocked from Google Cloud IPs (Cloudflare WAF) — use Yahoo Finance
  // getFNOSetupNSE kept for future use if a proxy is added
  return getFNOSetupYahoo(symbol)
}

function getFNOSetupYahoo(symbol) {
  const yahooSym = symbol === 'NIFTY' ? '^NSEI' : '^NSEBANK'
  const q = fetchQuote(yahooSym)
  if (q.error || !q.price) throw new Error('Yahoo fetch failed: ' + (q.error || 'no price'))

  const currentLevel = q.price
  const changePct    = q.changePct || 0
  const step         = symbol === 'NIFTY' ? 50 : 100
  const atmStrike    = Math.round(currentLevel / step) * step
  const zonePct      = currentLevel * 0.01

  const demandZone = { low: Math.round(currentLevel - zonePct * 3), high: Math.round(currentLevel - zonePct) }
  const supplyZone = { low: Math.round(currentLevel + zonePct),     high: Math.round(currentLevel + zonePct * 3) }

  const isBull      = changePct >= 0
  const direction   = isBull ? 'CALL' : 'PUT'
  const probability = Math.min(72, Math.max(50, Math.round(58 + Math.abs(changePct) * 2)))
  const lotSize     = symbol === 'NIFTY' ? 75 : 30

  // ATM premium estimate via Black-Scholes approximation
  const ivEst      = symbol === 'NIFTY' ? 0.14 : 0.18
  const premium    = Math.round(currentLevel * ivEst * Math.sqrt(5 / 252) * 10) / 10
  const entryLow   = Math.round(premium * 0.95 * 10) / 10
  const entryHigh  = Math.round(premium * 1.05 * 10) / 10
  const premiumSL  = Math.round(premium * 0.70 * 10) / 10
  const premiumTgt = Math.round(premium * 1.60 * 10) / 10

  const stopLoss = Math.round(isBull ? demandZone.low - step : supplyZone.high + step)
  const target   = Math.round(isBull ? supplyZone.low        : demandZone.high)

  const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000)
  const t   = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  const timeWindow = t < 570 ? 'AVOID' : t < 600 ? 'CAUTION' : t < 870 ? 'GOOD' : t < 915 ? 'CAUTION' : 'AVOID'

  return {
    current_level:       currentLevel,
    direction,
    probability,
    demand_zone:         demandZone,
    supply_zone:         supplyZone,
    stop_loss:           stopLoss,
    target,
    suggested_strike:    atmStrike,
    strike_type:         'ATM',
    iv_rank:             40,
    iv_label:            'MODERATE',
    pcr:                 isBull ? 1.1 : 0.9,
    pcr_label:           isBull ? 'BULLISH' : 'BEARISH',
    max_pain:            atmStrike,
    time_window:         timeWindow,
    zone_strength:       55,
    psychology_signals:  [],
    timeframe_alignment: 55,
    oi_analysis:         `Price-action analysis (NSE OI unavailable). ${symbol} at ${currentLevel}, day: ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%. Zones from price structure.`,
    change:              q.change || 0,
    change_pct:          changePct,
    oi_data:             [],
    is_estimated:        true,
    signal: {
      option_name:    `${symbol} ${atmStrike} ${isBull ? 'CE' : 'PE'}`,
      action:         isBull ? 'BUY CALL' : 'BUY PUT',
      expiry:         'Weekly',
      lot_size:       lotSize,
      premium,
      entry_low:      entryLow,
      entry_high:     entryHigh,
      sl:             premiumSL,
      target:         premiumTgt,
      risk_per_lot:   Math.round((premium - premiumSL)  * lotSize),
      reward_per_lot: Math.round((premiumTgt - premium) * lotSize),
      rr_ratio:       '1:2',
    },
  }
}

function getFNOSetupNSE(symbol) {
  const chain        = fetchNSEOptionChain(symbol)
  const records      = chain.records  || {}
  const data         = records.data   || []
  const currentLevel = records.underlyingValue || 0

  // Aggregate OI per strike
  const strikeMap = {}
  data.forEach(function(row) {
    const strike = row.strikePrice
    if (!strikeMap[strike]) strikeMap[strike] = { strike, calls_oi: 0, puts_oi: 0, calls_iv: 0, puts_iv: 0, calls_lp: 0, puts_lp: 0 }
    if (row.CE) {
      strikeMap[strike].calls_oi += row.CE.openInterest      || 0
      strikeMap[strike].calls_iv  = row.CE.impliedVolatility || 0
      strikeMap[strike].calls_lp  = row.CE.lastPrice         || 0
    }
    if (row.PE) {
      strikeMap[strike].puts_oi  += row.PE.openInterest      || 0
      strikeMap[strike].puts_iv   = row.PE.impliedVolatility || 0
      strikeMap[strike].puts_lp   = row.PE.lastPrice         || 0
    }
  })

  const strikes = Object.keys(strikeMap).map(Number).sort((a, b) => a - b)

  // OI heatmap — strikes within ±8% of current level
  const range  = currentLevel * 0.08
  const oiData = strikes
    .filter(k => Math.abs(k - currentLevel) <= range)
    .map(k => ({ strike: k, calls_oi: strikeMap[k].calls_oi, puts_oi: strikeMap[k].puts_oi }))

  // PCR
  let totalCallOI = 0, totalPutOI = 0
  strikes.forEach(k => { totalCallOI += strikeMap[k].calls_oi; totalPutOI += strikeMap[k].puts_oi })
  const pcr = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : 1.0

  // Max Pain
  const maxPain = fnoCalcMaxPain(strikeMap, strikes)

  // ATM strike
  const atmStrike = strikes.reduce((prev, curr) => Math.abs(curr - currentLevel) < Math.abs(prev - currentLevel) ? curr : prev)

  // IV Rank approximation
  const atmIV   = strikeMap[atmStrike] ? (strikeMap[atmStrike].calls_iv + strikeMap[atmStrike].puts_iv) / 2 : 20
  const ivRank  = Math.min(100, Math.max(0, Math.round(((atmIV - 10) / 30) * 100)))
  const ivLabel = ivRank < 30 ? 'CHEAP' : ivRank > 65 ? 'EXPENSIVE' : 'MODERATE'

  // Zones from OI
  let maxPutOI = 0, demandStrike = currentLevel
  let maxCallOI = 0, supplyStrike = currentLevel
  strikes.forEach(k => {
    if (k < currentLevel && strikeMap[k].puts_oi > maxPutOI)  { maxPutOI  = strikeMap[k].puts_oi;  demandStrike = k }
    if (k > currentLevel && strikeMap[k].calls_oi > maxCallOI) { maxCallOI = strikeMap[k].calls_oi; supplyStrike = k }
  })
  const step       = currentLevel > 30000 ? 200 : 50
  const demandZone = { low: demandStrike - step, high: demandStrike + step }
  const supplyZone = { low: supplyStrike - step, high: supplyStrike + step }

  // Direction
  const distToDemand = currentLevel - demandZone.high
  const distToSupply = supplyZone.low - currentLevel
  let direction
  if (pcr > 1.2)      direction = 'CALL'
  else if (pcr < 0.8) direction = 'PUT'
  else                direction = distToDemand < distToSupply ? 'CALL' : 'PUT'
  const isBull = direction === 'CALL'

  // Zone strength
  const nearby   = [atmStrike - step, atmStrike, atmStrike + step]
  const nearbyOI = nearby.reduce((s, k) => s + (strikeMap[k] ? strikeMap[k].calls_oi + strikeMap[k].puts_oi : 0), 0)
  const zoneStrength = Math.round(Math.min(90, 40 + Math.min(30, Math.abs(pcr - 1.0) * 30) + Math.min(40, nearbyOI / 50000)))

  // Timeframe alignment and probability
  const timeAlign   = Math.round(Math.min(90, zoneStrength * 0.6 + Math.abs(pcr - 1.0) * 15))
  const probability = Math.min(85, Math.max(45, Math.round(zoneStrength * 0.5 + timeAlign * 0.3 + Math.abs(pcr - 1.0) * 10 * 0.2)))

  // Strike suggestion
  const strikeStep      = symbol === 'NIFTY' ? 50 : 100
  const suggestedStrike = ivRank > 60
    ? (isBull ? atmStrike + strikeStep : atmStrike - strikeStep)
    : atmStrike
  const strikeType = Math.abs(suggestedStrike - atmStrike) < (symbol === 'NIFTY' ? 100 : 200) ? 'ATM' : 'Slightly OTM'

  // Stop loss and target (index level)
  const stopLoss = Math.round(isBull ? demandZone.low - (symbol === 'NIFTY' ? 50 : 150) : supplyZone.high + (symbol === 'NIFTY' ? 50 : 150))
  const target   = Math.round(isBull ? supplyZone.low : demandZone.high)

  // Option premium signal
  const lotSize      = symbol === 'NIFTY' ? 75 : 30
  const premiumRaw   = strikeMap[suggestedStrike]
    ? (isBull ? strikeMap[suggestedStrike].calls_lp : strikeMap[suggestedStrike].puts_lp)
    : 0
  const premium      = Math.round(premiumRaw * 10) / 10
  const entryLow     = Math.round(premium * 0.95 * 10) / 10   // entry range ±5%
  const entryHigh    = Math.round(premium * 1.05 * 10) / 10
  const premiumSL    = Math.round(premium * 0.70 * 10) / 10   // 30% stop loss
  const premiumTgt   = Math.round(premium * 1.60 * 10) / 10   // 60% target (2:1 RR)
  const riskPerLot   = Math.round((premium - premiumSL) * lotSize)
  const rewardPerLot = Math.round((premiumTgt - premium) * lotSize)

  // Time window (IST)
  const ist  = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000)
  const t    = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  const timeWindow = t < 570 ? 'AVOID' : t < 600 ? 'CAUTION' : t < 870 ? 'GOOD' : t < 915 ? 'CAUTION' : 'AVOID'

  // Psychology signals
  const psySignals = []
  if (pcr > 1.3)                              psySignals.push('SMART_MONEY_ACCUMULATION')
  if (pcr < 0.7)                              psySignals.push('DISTRIBUTION')
  if (distToDemand < currentLevel * 0.005)    psySignals.push('LIQUIDITY_GRAB')
  if (distToSupply < currentLevel * 0.005)    psySignals.push('BULL_TRAP')
  if (zoneStrength > 75 && !psySignals.includes('SMART_MONEY_ACCUMULATION')) psySignals.push('SMART_MONEY_ACCUMULATION')

  // OI analysis text
  let maxCallOIVal = 0, maxCallStrike = 0, maxPutOIVal = 0, maxPutStrike = 0
  strikes.forEach(k => {
    if (strikeMap[k].calls_oi > maxCallOIVal) { maxCallOIVal = strikeMap[k].calls_oi; maxCallStrike = k }
    if (strikeMap[k].puts_oi  > maxPutOIVal)  { maxPutOIVal  = strikeMap[k].puts_oi;  maxPutStrike  = k }
  })
  const pcrText   = pcr > 1.2 ? `PCR ${pcr} — heavy PUT writing suggests bullish bias`
                  : pcr < 0.8 ? `PCR ${pcr} — heavy CALL writing suggests bearish bias`
                  : `PCR ${pcr} — neutral, watch price action`
  const oiAnalysis = `Max CALL OI at ${maxCallStrike} — resistance zone. Max PUT OI at ${maxPutStrike} — support zone. ${pcrText}. Max Pain at ${maxPain}`

  return {
    current_level:       currentLevel,
    direction,
    probability,
    demand_zone:         demandZone,
    supply_zone:         supplyZone,
    stop_loss:           stopLoss,
    target,
    suggested_strike:    suggestedStrike,
    strike_type:         strikeType,
    iv_rank:             ivRank,
    iv_label:            ivLabel,
    pcr,
    pcr_label:           pcr >= 1.0 ? 'BULLISH' : 'BEARISH',
    max_pain:            maxPain,
    time_window:         timeWindow,
    zone_strength:       zoneStrength,
    psychology_signals:  psySignals.filter((v, i, a) => a.indexOf(v) === i).slice(0, 2),
    timeframe_alignment: timeAlign,
    oi_analysis:         oiAnalysis,
    change:              records.change    || 0,
    change_pct:          records.changePct || 0,
    oi_data:             oiData,
    signal: {
      option_name:    `${symbol} ${suggestedStrike} ${isBull ? 'CE' : 'PE'}`,
      action:         isBull ? 'BUY CALL' : 'BUY PUT',
      expiry:         'Weekly',
      lot_size:       lotSize,
      premium:        premium,
      entry_low:      entryLow,
      entry_high:     entryHigh,
      sl:             premiumSL,
      target:         premiumTgt,
      risk_per_lot:   riskPerLot,
      reward_per_lot: rewardPerLot,
      rr_ratio:       '1:2',
    },
  }
}

function fetchNSEOptionChain(symbol) {
  const baseHeaders = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection':      'keep-alive',
  }

  // Step 1 — get session cookies from NSE homepage
  const homeResp = UrlFetchApp.fetch('https://www.nseindia.com', {
    headers: baseHeaders,
    muteHttpExceptions: true,
    followRedirects: true,
  })
  Utilities.sleep(300)

  const rawCookies = homeResp.getAllHeaders()['Set-Cookie']
  let cookieStr = ''
  if (rawCookies) {
    const arr = Array.isArray(rawCookies) ? rawCookies : [rawCookies]
    cookieStr = arr.map(c => c.split(';')[0]).join('; ')
  }

  // Step 2 — fetch option chain with cookies
  const url  = `https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`
  const resp = UrlFetchApp.fetch(url, {
    headers: Object.assign({}, baseHeaders, {
      'Accept':  'application/json, text/plain, */*',
      'Referer': 'https://www.nseindia.com/option-chain',
      'Cookie':  cookieStr,
    }),
    muteHttpExceptions: true,
    followRedirects: true,
  })

  if (resp.getResponseCode() !== 200) {
    throw new Error(`NSE returned ${resp.getResponseCode()} for ${symbol}`)
  }

  return JSON.parse(resp.getContentText())
}

function fnoCalcMaxPain(strikeMap, strikes) {
  let minLoss = Infinity, maxPain = strikes[0]
  strikes.forEach(expiry => {
    let totalLoss = 0
    strikes.forEach(k => {
      if (expiry > k) totalLoss += (expiry - k) * strikeMap[k].calls_oi
      if (expiry < k) totalLoss += (k - expiry) * strikeMap[k].puts_oi
    })
    if (totalLoss < minLoss) { minLoss = totalLoss; maxPain = expiry }
  })
  return maxPain
}

// ─── Signal Tracker — Sheet Setup ────────────────────────────────────────────

const TAB_STOCK_TRACKER = 'Stock Signal Tracker'
const TAB_FNO_TRACKER   = 'FNO Signal Tracker'
const TAB_SUMMARY       = 'Summary Stats'

const STOCK_HEADERS = [
  'Signal Date','Symbol','Company Name','Sector','Signal Type','Holding Period',
  'Probability Score','Entry Low','Entry High','Stop Loss','Target 1','Target 2',
  'Psychology Signals','Confidence Score','Status','Entry Date','Exit Date',
  'Exit Price','Return %','Days Held','Notes'
]
const FNO_HEADERS = [
  'Signal Date','Signal Time','Index','Direction','Setup Probability',
  'Index Level at Signal','Suggested Strike','Option Type','Expiry',
  'Zone Level','Stop Loss Level','Target Level','PCR at Signal',
  'IV Rank at Signal','Max Pain at Signal','Confluence Breakdown',
  'Status','Index Level at Exit','Time of Exit','Index Move Points','Result','Notes'
]

function handleSetupSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID)

  // Stock Signal Tracker
  const stockSheet = getOrCreateTrackerSheet(ss, TAB_STOCK_TRACKER, STOCK_HEADERS, '#1a237e')
  stockSheet.setColumnWidth(1, 100)
  stockSheet.setColumnWidth(2, 110)
  stockSheet.setColumnWidth(3, 180)
  stockSheet.setColumnWidth(15, 110)

  // FNO Signal Tracker
  const fnoSheet = getOrCreateTrackerSheet(ss, TAB_FNO_TRACKER, FNO_HEADERS, '#1b5e20')
  fnoSheet.setColumnWidth(1, 100)
  fnoSheet.setColumnWidth(3, 90)

  // Summary Stats
  setupSummaryStatsTab(ss)

  return { ok: true, message: 'Tracker sheets created' }
}

function getOrCreateTrackerSheet(ss, name, headers, headerBg) {
  let sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
    const hRange = sheet.getRange(1, 1, 1, headers.length)
    hRange.setValues([headers])
    hRange.setBackground(headerBg)
    hRange.setFontColor('#FFFFFF')
    hRange.setFontWeight('bold')
    hRange.setFontSize(11)
    sheet.setFrozenRows(1)
    sheet.getRange(1, 1, 1, headers.length).createFilter()
  }
  return sheet
}

function setupSummaryStatsTab(ss) {
  let sheet = ss.getSheetByName(TAB_SUMMARY)
  if (!sheet) sheet = ss.insertSheet(TAB_SUMMARY)
  sheet.clear()

  const setHeader = (row, col, text) => {
    const cell = sheet.getRange(row, col)
    cell.setValue(text).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0D0D14').setFontSize(12)
  }
  const setLabel = (row, col, text) => sheet.getRange(row, col).setValue(text).setFontColor('#555555')
  const setFormula = (row, col, formula) => sheet.getRange(row, col).setFormula(formula).setFontWeight('bold')

  const sn = `'${TAB_STOCK_TRACKER}'`
  const fn = `'${TAB_FNO_TRACKER}'`

  setHeader(1, 1, '📊 STOCK SIGNALS SUMMARY')
  setLabel(2, 1, 'Total Signals')
  setFormula(2, 2, `=COUNTA(${sn}!B2:B)`)
  setLabel(3, 1, 'Waiting')
  setFormula(3, 2, `=COUNTIF(${sn}!O2:O,"WAITING")`)
  setLabel(4, 1, 'In Zone (Active)')
  setFormula(4, 2, `=COUNTIF(${sn}!O2:O,"IN ZONE")`)
  setLabel(5, 1, 'Target 1 Hit')
  setFormula(5, 2, `=COUNTIF(${sn}!O2:O,"TARGET 1 HIT")`)
  setLabel(6, 1, 'Target 2 Hit')
  setFormula(6, 2, `=COUNTIF(${sn}!O2:O,"TARGET 2 HIT")`)
  setLabel(7, 1, 'SL Hit')
  setFormula(7, 2, `=COUNTIF(${sn}!O2:O,"SL HIT")`)
  setLabel(8, 1, 'Expired')
  setFormula(8, 2, `=COUNTIF(${sn}!O2:O,"EXPIRED")`)
  setLabel(9, 1, 'Win Rate %')
  setFormula(9, 2, `=IFERROR(ROUND((COUNTIF(${sn}!O2:O,"TARGET 1 HIT")+COUNTIF(${sn}!O2:O,"TARGET 2 HIT"))/(COUNTIF(${sn}!O2:O,"TARGET 1 HIT")+COUNTIF(${sn}!O2:O,"TARGET 2 HIT")+COUNTIF(${sn}!O2:O,"SL HIT"))*100,1),0)`)
  setLabel(10, 1, 'Avg Return (Winners %)')
  setFormula(10, 2, `=IFERROR(ROUND(AVERAGEIF(${sn}!O2:O,"TARGET*",${sn}!S2:S),2),0)`)
  setLabel(11, 1, 'Avg Loss (Losers %)')
  setFormula(11, 2, `=IFERROR(ROUND(AVERAGEIF(${sn}!O2:O,"SL HIT",${sn}!S2:S),2),0)`)

  setHeader(13, 1, '⚡ FNO SIGNALS SUMMARY')
  setLabel(14, 1, 'Total FNO Signals')
  setFormula(14, 2, `=COUNTA(${fn}!C2:C)`)
  setLabel(15, 1, 'Target Hit')
  setFormula(15, 2, `=COUNTIF(${fn}!Q2:Q,"TARGET HIT")`)
  setLabel(16, 1, 'SL Hit')
  setFormula(16, 2, `=COUNTIF(${fn}!Q2:Q,"SL HIT")`)
  setLabel(17, 1, 'Expired')
  setFormula(17, 2, `=COUNTIF(${fn}!Q2:Q,"EXPIRED")`)
  setLabel(18, 1, 'FNO Win Rate %')
  setFormula(18, 2, `=IFERROR(ROUND(COUNTIF(${fn}!Q2:Q,"TARGET HIT")/(COUNTIF(${fn}!Q2:Q,"TARGET HIT")+COUNTIF(${fn}!Q2:Q,"SL HIT"))*100,1),0)`)
  setLabel(19, 1, 'Avg Points (Winners)')
  setFormula(19, 2, `=IFERROR(ROUND(AVERAGEIF(${fn}!Q2:Q,"TARGET HIT",${fn}!T2:T),0),0)`)
  setLabel(20, 1, 'Avg Points (Losers)')
  setFormula(20, 2, `=IFERROR(ROUND(AVERAGEIF(${fn}!Q2:Q,"SL HIT",${fn}!T2:T),0),0)`)

  sheet.setColumnWidth(1, 200)
  sheet.setColumnWidth(2, 120)
  sheet.setFrozenRows(0)

  return sheet
}

// ─── Signal Tracker — Log Stock Signal ───────────────────────────────────────

function handleLogSignal(p) {
  const ss    = SpreadsheetApp.openById(SHEET_ID)
  const sheet = ss.getSheetByName(TAB_STOCK_TRACKER)
  if (!sheet) return { ok: false, error: 'Sheet not found. Run ?action=setupSheets first.' }

  const symbol      = (p.symbol || '').toUpperCase()
  const signalDate  = p.signal_date || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MM-yyyy')
  const probability = parseFloat(p.probability || 0)

  if (!symbol) return { ok: false, error: 'symbol required' }
  if (probability < 50) return { ok: false, skipped: true, reason: 'probability < 50' }

  // Deduplicate: same symbol + same signal date
  const existing = sheet.getDataRange().getValues()
  for (let i = 1; i < existing.length; i++) {
    if (String(existing[i][1]).toUpperCase() === symbol &&
        String(existing[i][0]) === signalDate) {
      return { ok: true, skipped: true, reason: 'duplicate' }
    }
  }

  const row = [
    signalDate,
    symbol,
    p.name        || '',
    p.sector      || '',
    (p.signal_type || 'BUY').toUpperCase(),
    p.holding     || '30D',
    probability,
    parseFloat(p.entry_low  || 0),
    parseFloat(p.entry_high || 0),
    parseFloat(p.stop_loss  || 0),
    parseFloat(p.target1    || 0),
    parseFloat(p.target2    || 0),
    p.psychology  || '',
    parseFloat(p.confidence || probability),
    'WAITING',  // Status
    '',         // Entry Date
    '',         // Exit Date
    '',         // Exit Price
    '',         // Return %
    '',         // Days Held
    '',         // Notes
  ]

  sheet.appendRow(row)
  const newRow = sheet.getLastRow()
  sheet.getRange(newRow, 1, 1, row.length)
    .setBackground('#FFFFFF').setFontColor('#000000')

  return { ok: true, logged: symbol }
}

// ─── Signal Tracker — Update Stock Signal Statuses ────────────────────────────

function handleUpdateSignalStatuses() {
  const ss    = SpreadsheetApp.openById(SHEET_ID)
  const sheet = ss.getSheetByName(TAB_STOCK_TRACKER)
  if (!sheet) return { ok: false, error: 'Sheet not found' }

  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return { ok: true, updated: 0 }

  const data    = sheet.getRange(2, 1, lastRow - 1, 21).getValues()
  const today   = new Date()
  const todayStr = Utilities.formatDate(today, 'Asia/Kolkata', 'dd-MM-yyyy')
  const holdingDays = { '15D': 15, '30D': 30, '3M': 90, '6M': 180, '1Y': 365 }
  let updated   = 0

  for (let i = 0; i < data.length; i++) {
    const row        = data[i]
    const status     = String(row[14]).trim()
    if (status !== 'WAITING' && status !== 'IN ZONE') continue

    const symbol     = String(row[1]).toUpperCase()
    const signalType = String(row[4]).toUpperCase()
    const holding    = String(row[5])
    const entryLow   = parseFloat(row[7])  || 0
    const entryHigh  = parseFloat(row[8])  || 0
    const stopLoss   = parseFloat(row[9])  || 0
    const target1    = parseFloat(row[10]) || 0
    const target2    = parseFloat(row[11]) || 0
    if (!symbol) continue

    const quote = fetchQuote(symbol)
    if (quote.error || !quote.price) { Utilities.sleep(300); continue }
    const price    = quote.price
    const entryMid = (entryLow + entryHigh) / 2

    // Days elapsed since signal date
    let signalDateObj = new Date()
    try {
      const d = String(row[0])
      if (d.includes('-')) {
        const parts = d.split('-')
        if (parts[0].length === 4) signalDateObj = new Date(d)  // yyyy-MM-dd
        else signalDateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)  // dd-MM-yyyy
      } else if (row[0] instanceof Date) {
        signalDateObj = row[0]
      }
    } catch(_) {}
    const daysElapsed = Math.round((today - signalDateObj) / 86400000)
    const maxDays     = holdingDays[holding] || 30

    const rowNum = i + 2
    let newStatus = null, bgColor = null, textColor = '#FFFFFF'

    const isBuy  = signalType === 'BUY'
    const slHit  = isBuy ? price <= stopLoss : price >= stopLoss
    const t2Hit  = isBuy ? price >= target2  : price <= target2
    const t1Hit  = isBuy ? price >= target1  : price <= target1
    const inZone = price >= entryLow && price <= entryHigh
    const expired = daysElapsed > maxDays

    if (slHit) {
      const ret = ((price - entryMid) / entryMid * 100 * (isBuy ? 1 : -1)).toFixed(2)
      newStatus = 'SL HIT'; bgColor = '#F44336'
      sheet.getRange(rowNum, 17).setValue(todayStr)
      sheet.getRange(rowNum, 18).setValue(price)
      sheet.getRange(rowNum, 19).setValue(parseFloat(ret))
      sheet.getRange(rowNum, 20).setValue(daysElapsed)
      sheet.getRange(rowNum, 21).setValue(`SL Hit ❌ ${ret}%`)
    } else if (t2Hit) {
      const ret = ((price - entryMid) / entryMid * 100 * (isBuy ? 1 : -1)).toFixed(2)
      newStatus = 'TARGET 2 HIT'; bgColor = '#1B5E20'
      sheet.getRange(rowNum, 17).setValue(todayStr)
      sheet.getRange(rowNum, 18).setValue(price)
      sheet.getRange(rowNum, 19).setValue(parseFloat(ret))
      sheet.getRange(rowNum, 20).setValue(daysElapsed)
      sheet.getRange(rowNum, 21).setValue(`Target 2 Hit ✅✅ +${ret}%`)
    } else if (t1Hit) {
      const ret = ((price - entryMid) / entryMid * 100 * (isBuy ? 1 : -1)).toFixed(2)
      newStatus = 'TARGET 1 HIT'; bgColor = '#4CAF50'
      sheet.getRange(rowNum, 17).setValue(todayStr)
      sheet.getRange(rowNum, 18).setValue(price)
      sheet.getRange(rowNum, 19).setValue(parseFloat(ret))
      sheet.getRange(rowNum, 20).setValue(daysElapsed)
      sheet.getRange(rowNum, 21).setValue(`Target 1 Hit ✅ +${ret}%`)
    } else if (inZone && status === 'WAITING') {
      newStatus = 'IN ZONE'; bgColor = '#FF9800'
      sheet.getRange(rowNum, 16).setValue(todayStr)
    } else if (expired) {
      newStatus = 'EXPIRED'; bgColor = '#9E9E9E'
      sheet.getRange(rowNum, 21).setValue('Expired — holding period ended')
    }

    if (newStatus) {
      sheet.getRange(rowNum, 15).setValue(newStatus)
      sheet.getRange(rowNum, 1, 1, 21).setBackground(bgColor).setFontColor(textColor)
      updated++
    }

    Utilities.sleep(250)
  }

  return { ok: true, updated }
}

// ─── Signal Tracker — Log FNO Signal ─────────────────────────────────────────

function handleLogFNOSignal(p) {
  const ss    = SpreadsheetApp.openById(SHEET_ID)
  const sheet = ss.getSheetByName(TAB_FNO_TRACKER)
  if (!sheet) return { ok: false, error: 'Sheet not found. Run ?action=setupSheets first.' }

  const index       = (p.index || 'NIFTY').toUpperCase()
  const signalDate  = p.signal_date || Utilities.formatDate(new Date(new Date().getTime() + 5.5*3600000), 'UTC', 'dd-MM-yyyy')
  const probability = parseFloat(p.probability || 0)
  if (probability < 50) return { ok: false, skipped: true, reason: 'probability < 50' }

  // Deduplicate: same index + same signal date + same direction
  const existing = sheet.getDataRange().getValues()
  for (let i = 1; i < existing.length; i++) {
    if (String(existing[i][0]) === signalDate &&
        String(existing[i][2]).toUpperCase() === index &&
        String(existing[i][3]).toUpperCase() === (p.direction || '').toUpperCase()) {
      return { ok: true, skipped: true, reason: 'duplicate' }
    }
  }

  const row = [
    signalDate,
    p.signal_time  || '',
    index,
    (p.direction   || 'CALL').toUpperCase(),
    probability,
    parseFloat(p.index_level  || 0),
    parseFloat(p.strike       || 0),
    (p.option_type || 'CE').toUpperCase(),
    p.expiry       || 'Weekly',
    p.zone_level   || '',
    parseFloat(p.sl_level     || 0),
    parseFloat(p.target_level || 0),
    parseFloat(p.pcr          || 0),
    parseFloat(p.iv_rank      || 0),
    parseFloat(p.max_pain     || 0),
    p.confluences  || '',
    'ACTIVE',  // Status
    '',        // Index Level at Exit
    '',        // Time of Exit
    '',        // Index Move Points
    '',        // Result
    '',        // Notes
  ]

  sheet.appendRow(row)
  const newRow = sheet.getLastRow()
  sheet.getRange(newRow, 1, 1, row.length).setBackground('#FF9800').setFontColor('#FFFFFF')

  return { ok: true, logged: index }
}

// ─── Signal Tracker — Update FNO Signal Statuses ─────────────────────────────

function handleUpdateFNOStatuses() {
  const ss    = SpreadsheetApp.openById(SHEET_ID)
  const sheet = ss.getSheetByName(TAB_FNO_TRACKER)
  if (!sheet) return { ok: false, error: 'Sheet not found' }

  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return { ok: true, updated: 0 }

  const data     = sheet.getRange(2, 1, lastRow - 1, 22).getValues()
  const ist      = new Date(new Date().getTime() + 5.5 * 3600000)
  const todayStr = Utilities.formatDate(ist, 'UTC', 'dd-MM-yyyy')
  const timeStr  = Utilities.formatDate(ist, 'UTC', 'hh:mm a')
  let updated    = 0

  // Fetch current NIFTY and BANKNIFTY levels
  let niftyLevel = 0, bnLevel = 0
  try {
    const niftyData = getFNOSetup('NIFTY')
    niftyLevel = niftyData.current_level || 0
  } catch(_) {}
  try {
    const bnData = getFNOSetup('BANKNIFTY')
    bnLevel = bnData.current_level || 0
  } catch(_) {}

  for (let i = 0; i < data.length; i++) {
    const row        = data[i]
    const status     = String(row[16]).trim()
    if (status !== 'ACTIVE') continue

    const signalDate = String(row[0])
    if (signalDate !== todayStr) {
      // Previous day active signal — expire it
      sheet.getRange(i + 2, 17).setValue('EXPIRED')
      sheet.getRange(i + 2, 22).setValue('Expired — no resolution')
      sheet.getRange(i + 2, 1, 1, 22).setBackground('#9E9E9E').setFontColor('#FFFFFF')
      updated++
      continue
    }

    const indexName   = String(row[2]).toUpperCase()
    const direction   = String(row[3]).toUpperCase()
    const indexLevel  = parseFloat(row[5]) || 0
    const slLevel     = parseFloat(row[10]) || 0
    const targetLevel = parseFloat(row[11]) || 0
    const currentLevel = indexName === 'BANKNIFTY' ? bnLevel : niftyLevel
    if (!currentLevel) continue

    const pts       = direction === 'CALL' ? currentLevel - indexLevel : indexLevel - currentLevel
    const rowNum    = i + 2

    // Check target: index reached target zone
    const targetHit = direction === 'CALL' ? currentLevel >= targetLevel : currentLevel <= targetLevel
    // Check SL: index broke zone
    const slHit     = direction === 'CALL' ? currentLevel <= slLevel : currentLevel >= slLevel

    if (targetHit) {
      sheet.getRange(rowNum, 17).setValue('TARGET HIT')
      sheet.getRange(rowNum, 18).setValue(currentLevel)
      sheet.getRange(rowNum, 19).setValue(timeStr)
      sheet.getRange(rowNum, 20).setValue(pts)
      sheet.getRange(rowNum, 21).setValue('WIN')
      sheet.getRange(rowNum, 22).setValue(`Target Hit ✅ +${pts} pts`)
      sheet.getRange(rowNum, 1, 1, 22).setBackground('#4CAF50').setFontColor('#FFFFFF')
      updated++
    } else if (slHit) {
      sheet.getRange(rowNum, 17).setValue('SL HIT')
      sheet.getRange(rowNum, 18).setValue(currentLevel)
      sheet.getRange(rowNum, 19).setValue(timeStr)
      sheet.getRange(rowNum, 20).setValue(pts)
      sheet.getRange(rowNum, 21).setValue('LOSS')
      sheet.getRange(rowNum, 22).setValue(`SL Hit ❌ ${pts} pts`)
      sheet.getRange(rowNum, 1, 1, 22).setBackground('#F44336').setFontColor('#FFFFFF')
      updated++
    }
  }

  return { ok: true, updated }
}

// ─── Signal Tracker — Performance Stats for App ───────────────────────────────

function handleGetPerformance() {
  const ss = SpreadsheetApp.openById(SHEET_ID)

  // ── Stock signals ──
  const stockSheet = ss.getSheetByName(TAB_STOCK_TRACKER)
  let stockData = []
  if (stockSheet && stockSheet.getLastRow() > 1) {
    stockData = stockSheet.getRange(2, 1, stockSheet.getLastRow() - 1, 21).getValues()
      .filter(r => r[1])  // skip empty rows
  }

  const stockStats = calcStockStats(stockData)

  // ── FNO signals ──
  const fnoSheet = ss.getSheetByName(TAB_FNO_TRACKER)
  let fnoData = []
  if (fnoSheet && fnoSheet.getLastRow() > 1) {
    fnoData = fnoSheet.getRange(2, 1, fnoSheet.getLastRow() - 1, 22).getValues()
      .filter(r => r[2])  // skip empty rows
  }

  const fnoStats = calcFNOStats(fnoData)

  // ── Monthly breakdown (stock) ──
  const monthly = calcMonthlyBreakdown(stockData)

  // ── Recent closed (last 20) ──
  const recentClosed = stockData
    .filter(r => ['TARGET 1 HIT','TARGET 2 HIT','SL HIT'].includes(String(r[14])))
    .slice(-20).reverse()
    .map(r => ({
      symbol:     String(r[1]),
      name:       String(r[2]),
      signal_type:String(r[4]),
      status:     String(r[14]),
      return_pct: parseFloat(r[18]) || 0,
      days_held:  parseInt(r[19])   || 0,
      exit_date:  String(r[16]),
    }))

  return { stock: stockStats, fno: fnoStats, monthly, recent_closed: recentClosed, generated_at: now() }
}

function calcStockStats(data) {
  const total    = data.length
  const waiting  = data.filter(r => r[14] === 'WAITING').length
  const inZone   = data.filter(r => r[14] === 'IN ZONE').length
  const t1       = data.filter(r => r[14] === 'TARGET 1 HIT').length
  const t2       = data.filter(r => r[14] === 'TARGET 2 HIT').length
  const slHit    = data.filter(r => r[14] === 'SL HIT').length
  const expired  = data.filter(r => r[14] === 'EXPIRED').length
  const wins     = t1 + t2
  const losses   = slHit
  const winRate  = (wins + losses) > 0 ? Math.round(wins / (wins + losses) * 1000) / 10 : 0

  const winReturns  = data.filter(r => String(r[14]).startsWith('TARGET') && r[18]).map(r => parseFloat(r[18]))
  const lossReturns = data.filter(r => r[14] === 'SL HIT' && r[18]).map(r => parseFloat(r[18]))
  const avgWin  = winReturns.length  ? Math.round(winReturns.reduce((a,b)=>a+b,0) / winReturns.length * 100) / 100 : 0
  const avgLoss = lossReturns.length ? Math.round(lossReturns.reduce((a,b)=>a+b,0) / lossReturns.length * 100) / 100 : 0

  const allClosed = data.filter(r => r[18] !== '')
  const best  = allClosed.reduce((b,r) => parseFloat(r[18]) > parseFloat(b[18] || '-999') ? r : b, allClosed[0] || [])
  const worst = allClosed.reduce((w,r) => parseFloat(r[18]) < parseFloat(w[18] || '999')  ? r : w, allClosed[0] || [])

  return { total, waiting, in_zone: inZone, t1_hit: t1, t2_hit: t2, sl_hit: slHit, expired,
    win_rate: winRate, avg_return_winners: avgWin, avg_loss_losers: avgLoss,
    best_signal:  best  ? { symbol: String(best[1]),  return_pct: parseFloat(best[18])  || 0 } : null,
    worst_signal: worst ? { symbol: String(worst[1]), return_pct: parseFloat(worst[18]) || 0 } : null,
  }
}

function calcFNOStats(data) {
  const total      = data.length
  const active     = data.filter(r => r[16] === 'ACTIVE').length
  const targetHit  = data.filter(r => r[16] === 'TARGET HIT').length
  const slHit      = data.filter(r => r[16] === 'SL HIT').length
  const expired    = data.filter(r => r[16] === 'EXPIRED').length
  const winRate    = (targetHit + slHit) > 0 ? Math.round(targetHit / (targetHit + slHit) * 1000) / 10 : 0

  const winPts  = data.filter(r => r[16] === 'TARGET HIT' && r[19]).map(r => parseFloat(r[19]))
  const lossPts = data.filter(r => r[16] === 'SL HIT'     && r[19]).map(r => parseFloat(r[19]))
  const avgWinPts  = winPts.length  ? Math.round(winPts.reduce((a,b)=>a+b,0)  / winPts.length)  : 0
  const avgLossPts = lossPts.length ? Math.round(lossPts.reduce((a,b)=>a+b,0) / lossPts.length) : 0

  const niftyWins = data.filter(r => r[2]==='NIFTY'     && r[16]==='TARGET HIT').map(r=>parseFloat(r[19])||0)
  const bnWins    = data.filter(r => r[2]==='BANKNIFTY'  && r[16]==='TARGET HIT').map(r=>parseFloat(r[19])||0)
  const bestNifty = niftyWins.length ? Math.max(...niftyWins) : 0
  const bestBN    = bnWins.length    ? Math.max(...bnWins)    : 0

  return { total, active, target_hit: targetHit, sl_hit: slHit, expired,
    win_rate: winRate, avg_pts_winners: avgWinPts, avg_pts_losers: avgLossPts,
    best_nifty_pts: bestNifty, best_banknifty_pts: bestBN }
}

function calcMonthlyBreakdown(data) {
  const months = {}
  data.forEach(r => {
    const dateStr = String(r[0])
    if (!dateStr || dateStr.length < 7) return
    const parts = dateStr.includes('-') && dateStr.split('-')[0].length === 2
      ? [dateStr.split('-')[2], dateStr.split('-')[1] - 1]  // dd-MM-yyyy
      : [dateStr.substring(0, 4), parseInt(dateStr.substring(5, 7)) - 1]  // yyyy-MM-dd
    const key = `${parts[0]}-${String(parseInt(parts[1]) + 1).padStart(2,'0')}`
    if (!months[key]) months[key] = { wins: 0, losses: 0, returns: [] }
    const status = String(r[14])
    if (status.startsWith('TARGET'))      { months[key].wins++;   if (r[18]) months[key].returns.push(parseFloat(r[18])) }
    else if (status === 'SL HIT')         { months[key].losses++; if (r[18]) months[key].returns.push(parseFloat(r[18])) }
  })

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return Object.keys(months).sort().slice(-6).map(key => {
    const m      = months[key]
    const total  = m.wins + m.losses
    const yr     = key.split('-')[0]
    const mo     = parseInt(key.split('-')[1]) - 1
    const avgRet = m.returns.length ? Math.round(m.returns.reduce((a,b)=>a+b,0)/m.returns.length*100)/100 : 0
    return {
      month:    `${monthNames[mo]} ${yr}`,
      total,
      wins:     m.wins,
      losses:   m.losses,
      win_rate: total > 0 ? Math.round(m.wins / total * 1000) / 10 : 0,
      avg_return: avgRet,
    }
  })
}

// ─── Triggers ─────────────────────────────────────────────────────────────────

function handleInstallTriggers() {
  // Remove existing triggers with these names to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction()
    if (fn === 'handleUpdateSignalStatuses' || fn === 'handleUpdateFNOStatuses') {
      ScriptApp.deleteTrigger(t)
    }
  })

  // Stock signal statuses — daily at 4 PM IST (10:30 UTC)
  ScriptApp.newTrigger('handleUpdateSignalStatuses')
    .timeBased().everyDays(1).atHour(10).nearMinute(30)
    .inTimezone('UTC').create()

  // FNO statuses — daily at 3:30 PM IST (10:00 UTC)
  ScriptApp.newTrigger('handleUpdateFNOStatuses')
    .timeBased().everyDays(1).atHour(10).nearMinute(0)
    .inTimezone('UTC').create()

  return { ok: true, triggers: 2 }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.getRange(1, 1, 1, headers.length).setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    sheet.setFrozenRows(1)
  }
  return sheet
}

function appendRow(tabName, values) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName)
  if (sheet) sheet.appendRow(values)
}

function findRow(sheet, col, value) {
  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col - 1]).toLowerCase() === String(value).toLowerCase()) return i + 1
  }
  return -1
}

function now() {
  return new Date().toISOString()
}

function jsonOk(data) {
  const out = ContentService.createTextOutput(JSON.stringify(data))
  out.setMimeType(ContentService.MimeType.JSON)
  return out
}
