/**
 * StockSage — Upstox Live LTP Proxy
 * Deploy as Google Apps Script Web App (Execute as: Me, Who has access: Anyone)
 *
 * Setup (one-time):
 *   1. Open Apps Script → Project Settings → Script Properties
 *   2. Add property: UPSTOX_TOKEN = <your Analytics token>
 *
 * App calls:
 *   GET ?instrument_key=NSE_FO|NIFTY26JUN2323950PE
 *   Returns: { ltp, change, change_pct, timestamp }
 */

var UPSTOX_BASE = 'https://api.upstox.com/v2';

function doGet(e) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    var action = (e.parameter.action || 'ltp');

    if (action === 'ltp') {
      return handleLTP(e, headers);
    }

    return respond({ error: 'Unknown action' }, headers);
  } catch (err) {
    return respond({ error: err.message }, headers);
  }
}

// ── Live LTP for a single option instrument ──────────────────
function handleLTP(e, headers) {
  var instrumentKey = e.parameter.instrument_key;
  if (!instrumentKey) {
    return respond({ error: 'instrument_key required' }, headers);
  }

  var token = PropertiesService.getScriptProperties().getProperty('UPSTOX_TOKEN');
  if (!token) {
    return respond({ error: 'UPSTOX_TOKEN not configured in Script Properties' }, headers);
  }

  var url = UPSTOX_BASE + '/market-quote/quotes?instrument_key=' + encodeURIComponent(instrumentKey);
  var resp = UrlFetchApp.fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json',
    },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    return respond({ error: 'Upstox returned ' + resp.getResponseCode() }, headers);
  }

  var data = JSON.parse(resp.getContentText()).data || {};
  var quote = null;
  for (var k in data) { quote = data[k]; break; }

  if (!quote) {
    return respond({ error: 'No quote data' }, headers);
  }

  var ltp       = quote.last_price || 0;
  var prevClose = (quote.ohlc && quote.ohlc.close) ? quote.ohlc.close : ltp;
  var change    = Math.round((ltp - prevClose) * 100) / 100;
  var changePct = prevClose ? Math.round((change / prevClose) * 10000) / 100 : 0;

  return respond({
    ltp:        ltp,
    change:     change,
    change_pct: changePct,
    timestamp:  new Date().toISOString(),
  }, headers);
}

// ── Batch LTP for multiple instruments ───────────────────────
// GET ?action=batch&keys=KEY1,KEY2
function handleBatch(e, headers) {
  var keysParam = e.parameter.keys;
  if (!keysParam) return respond({ error: 'keys required' }, headers);

  var token = PropertiesService.getScriptProperties().getProperty('UPSTOX_TOKEN');
  if (!token) return respond({ error: 'UPSTOX_TOKEN not configured' }, headers);

  var keys = keysParam.split(',').slice(0, 5); // max 5 at a time
  var url  = UPSTOX_BASE + '/market-quote/quotes?instrument_key=' + keys.map(encodeURIComponent).join('%2C');

  var resp = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    return respond({ error: 'Upstox returned ' + resp.getResponseCode() }, headers);
  }

  var raw    = JSON.parse(resp.getContentText()).data || {};
  var result = {};

  for (var k in raw) {
    var q         = raw[k];
    var ltp       = q.last_price || 0;
    var prevClose = (q.ohlc && q.ohlc.close) ? q.ohlc.close : ltp;
    var change    = Math.round((ltp - prevClose) * 100) / 100;
    result[k] = {
      ltp:        ltp,
      change:     change,
      change_pct: prevClose ? Math.round((change / prevClose) * 10000) / 100 : 0,
    };
  }

  return respond({ quotes: result, timestamp: new Date().toISOString() }, headers);
}

function respond(obj, headers) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
