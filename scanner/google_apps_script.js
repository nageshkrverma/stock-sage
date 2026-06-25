// StockSage — Google Apps Script Web App
// Sheet: https://docs.google.com/spreadsheets/d/1a1ltQkmg_c8_844zaoUpChjWwq2jTKYcBMV2DtTUYL0
//
// Deploy as: Execute as ME, Anyone can access (no login required)
//
// Endpoints:
//   ?action=quote&symbol=RELIANCE                     → live stock price
//   ?action=registerUser&...                          → save user profile on registration
//   ?action=submitPayment&...                         → log UTR payment request
//   ?action=logQuery&symbol=X&email=Y                 → log stock search
//   ?action=ping                                      → health check

const SHEET_ID = '1a1ltQkmg_c8_844zaoUpChjWwq2jTKYcBMV2DtTUYL0'

// Tab names
const TAB_USERS    = 'Users'
const TAB_SUBS     = 'Subscriptions'
const TAB_PAYMENTS = 'Payments'
const TAB_QUERIES  = 'QueryLogs'

// ─── Entry point ────────────────────────────────────────────────────────────

function doGet(e) {
  const p = e.parameter
  const action = p.action || 'quote'

  try {
    if (action === 'ping')              return jsonOk({ ok: true, ts: now() })
    if (action === 'quote')             return jsonOk(handleQuote(p))
    if (action === 'registerUser')      return jsonOk(handleRegisterUser(p))
    if (action === 'submitPayment')     return jsonOk(handlePayment(p))
    if (action === 'logQuery')          return jsonOk(handleLogQuery(p))
    if (action === 'saveToken')         return jsonOk(handleSaveToken(p))
    if (action === 'sendSignalAlert')   return jsonOk(handleSendSignalAlert(p))
    return jsonOk({ error: 'unknown action' })
  } catch (err) {
    return jsonOk({ error: err.message })
  }
}

// ─── Stock Quote ─────────────────────────────────────────────────────────────

function handleQuote(p) {
  const symbol = (p.symbol || '').toUpperCase().trim()
  if (!symbol) return { error: 'symbol required' }

  // Log query if email provided
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

// ─── Register User ────────────────────────────────────────────────────────────
// Called from app when user registers
// params: uid, email, fullName, dob, city, state, registeredAt, freeUntil, plan

function handleRegisterUser(p) {
  const ss = SpreadsheetApp.openById(SHEET_ID)

  // Users tab
  const usersSheet = getOrCreateSheet(ss, TAB_USERS, [
    'UID', 'Email', 'Full Name', 'DOB', 'City', 'State', 'Registered At', 'Free Until', 'Plan', 'Updated At'
  ])

  // Check if user already exists (by email)
  const existing = findRow(usersSheet, 2, p.email)
  if (existing > 0) {
    // Update existing row
    usersSheet.getRange(existing, 3, 1, 8).setValues([[
      p.fullName, p.dob, p.city, p.state, p.registeredAt, p.freeUntil, p.plan, now()
    ]])
  } else {
    appendRow(TAB_USERS, [
      p.uid, p.email, p.fullName, p.dob || '', p.city || '', p.state || '',
      p.registeredAt, p.freeUntil, p.plan || 'trial', now()
    ])
  }

  // Subscriptions tab
  const subSheet = getOrCreateSheet(ss, TAB_SUBS, [
    'Email', 'Full Name', 'Plan', 'Trial Start', 'Trial End', 'Paid On', 'Status', 'Updated At'
  ])
  const existingSub = findRow(subSheet, 1, p.email)
  const status = p.plan === 'paid' ? 'Active Paid' : 'Trial'
  if (existingSub > 0) {
    subSheet.getRange(existingSub, 3, 1, 6).setValues([[
      p.plan, p.registeredAt, p.freeUntil, '', status, now()
    ]])
  } else {
    appendRow(TAB_SUBS, [
      p.email, p.fullName, p.plan || 'trial', p.registeredAt, p.freeUntil, '', status, now()
    ])
  }

  return { ok: true, message: 'User registered' }
}

// ─── Payment Submission ───────────────────────────────────────────────────────
// Called from paywall screen when user submits UTR
// params: email, fullName, utr, amount, submittedAt

function handlePayment(p) {
  getOrCreateSheet(SpreadsheetApp.openById(SHEET_ID), TAB_PAYMENTS, [
    'Email', 'Full Name', 'UTR Number', 'Amount', 'Submitted At', 'Status', 'Verified By', 'Verified At'
  ])

  appendRow(TAB_PAYMENTS, [
    p.email, p.fullName, p.utr, p.amount || '499', p.submittedAt || now(), 'Pending', '', ''
  ])

  return { ok: true, message: 'Payment logged' }
}

// ─── Query Log ────────────────────────────────────────────────────────────────

function handleLogQuery(p) {
  getOrCreateSheet(SpreadsheetApp.openById(SHEET_ID), TAB_QUERIES, [
    'Timestamp', 'Email', 'Symbol'
  ])
  appendRow(TAB_QUERIES, [now(), p.email || 'guest', (p.symbol || '').toUpperCase()])
  return { ok: true }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name)
  if (!sheet) {
    sheet = ss.insertSheet(name)
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    sheet.setFrozenRows(1)
  }
  return sheet
}

function appendRow(tabName, values) {
  const ss = SpreadsheetApp.openById(SHEET_ID)
  const sheet = ss.getSheetByName(tabName)
  if (sheet) sheet.appendRow(values)
}

function findRow(sheet, col, value) {
  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col - 1]).toLowerCase() === String(value).toLowerCase()) return i + 1
  }
  return -1
}

// ─── Save Push Token ──────────────────────────────────────────────────────────
// params: email, token, platform

function handleSaveToken(p) {
  const ss = SpreadsheetApp.openById(SHEET_ID)
  const sheet = getOrCreateSheet(ss, 'PushTokens', [
    'Email', 'Token', 'Platform', 'Updated At'
  ])

  const existing = findRow(sheet, 1, p.email)
  if (existing > 0) {
    sheet.getRange(existing, 2, 1, 3).setValues([[p.token, p.platform, now()]])
  } else {
    sheet.appendRow([p.email, p.token, p.platform || 'android', now()])
  }
  return { ok: true }
}

// ─── Send Signal Notification to All Users ───────────────────────────────────
// Called from GitHub Actions after scanner runs
// params: totalSignals, marketDate

function handleSendSignalAlert(p) {
  const ss = SpreadsheetApp.openById(SHEET_ID)
  const sheet = ss.getSheetByName('PushTokens')
  if (!sheet) return { ok: false, reason: 'No tokens yet' }

  const data = sheet.getDataRange().getValues()
  const tokens = []
  for (let i = 1; i < data.length; i++) {
    if (data[i][1]) tokens.push(data[i][1]) // column 2 = token
  }

  if (tokens.length === 0) return { ok: false, reason: 'No registered tokens' }

  const totalSignals = p.totalSignals || '?'
  const marketDate = p.marketDate || new Date().toLocaleDateString('en-IN')

  // Send via Expo Push Notification Service (free, no Firebase key needed)
  const messages = tokens.map(token => ({
    to: token,
    title: '📊 StockSage — New Signals',
    body: `${totalSignals} fresh signals for ${marketDate}. Tap to view!`,
    sound: 'default',
    data: { screen: 'signals' },
    priority: 'high',
  }))

  // Expo push API accepts up to 100 messages per request
  const chunkSize = 100
  let sent = 0
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize)
    const res = UrlFetchApp.fetch('https://exp.host/--/api/v2/push/send', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(chunk),
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() === 200) sent += chunk.length
  }

  return { ok: true, tokenCount: tokens.length, sent }
}

function now() {
  return new Date().toISOString()
}

function jsonOk(data) {
  const out = ContentService.createTextOutput(JSON.stringify(data))
  out.setMimeType(ContentService.MimeType.JSON)
  return out
}
