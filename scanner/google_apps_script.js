// StockSage — Google Apps Script Web App
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
    if (action === 'ping')            return jsonOk({ ok: true, ts: now() })
    if (action === 'quote')           return jsonOk(handleQuote(p))
    if (action === 'analyse')         return jsonOk(handleAnalyse(p))
    if (action === 'registerUser')    return jsonOk(handleRegisterUser(p))
    if (action === 'submitPayment')   return jsonOk(handlePayment(p))
    if (action === 'logQuery')        return jsonOk(handleLogQuery(p))
    if (action === 'saveToken')       return jsonOk(handleSaveToken(p))
    if (action === 'sendSignalAlert') return jsonOk(handleSendSignalAlert(p))
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
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=1d&range=1d`,
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
    title: '📊 StockSage — New Signals',
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
