import crypto from 'node:crypto';
import { CONFIG } from './config.js';

const BASE = 'https://bitso.com/api/v3';

// Stablecoins / fiat que NO son cripto operables
const STABLE_BASES = new Set([
  'USDT', 'USDS', 'USDC', 'PYUSD', 'RLUSD', 'TUSD', 'DAI', 'EUR', 'USD', 'MXNC'
]);

async function request(path, query = '', options = {}) {
  const url = BASE + path + (query ? `?${query}` : '');
  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Bitso no JSON (HTTP ${res.status}) para ${path}: ${text.slice(0, 120)}`);
  }
  if (!json.success) {
    throw new Error(`Bitso error en ${path}: ${JSON.stringify(json.error || json)}`);
  }
  return json.payload;
}

// ---------- publico ----------

export async function listCryptoPairs() {
  const books = await request('/available_books');
  const seen = new Set();
  const pairs = [];
  for (const b of books) {
    const symbol = b.book; // ej: btc_mxn
    const parts = symbol.split('_');
    const quote = parts[parts.length - 1].toUpperCase();
    const base = parts.slice(0, parts.length - 1).join('_').toUpperCase();
    if (quote !== 'MXN') continue;
    if (STABLE_BASES.has(base)) continue;
    if (seen.has(base)) continue;
    seen.add(base);
    pairs.push(`${base}/MXN`);
  }
  pairs.sort();
  return pairs;
}

function toBook(symbol) {
  return symbol.replace('/', '_').toLowerCase();
}

export async function fetchOhlcv(symbol, timeframe = '1h', limit = 100) {
  const timeBucket = timeout(timeframe);
  const now = Date.now();
  const start = now - timeBucket * 1000 * Math.min(limit, 500);
  const query = `book=${toBook(symbol)}&time_bucket=${timeBucket}&start=${start}&end=${now}`;
  const payload = await request('/ohlc', query);
  const rows = Array.isArray(payload) ? payload : [];
  rows.sort((a, b) => (a.bucket_start_time || 0) - (b.bucket_start_time || 0));
  return rows.slice(-limit).map((r) => ({
    timestamp: r.bucket_start_time || r.created_at || 0,
    open: Number(r.first_rate),
    high: Number(r.max_rate),
    low: Number(r.min_rate),
    close: Number(r.last_rate),
    volume: Number(r.volume)
  }));
}

function timeout(timeframe) {
  const map = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
  return map[timeframe] || 3600;
}

export async function fetchTicker(symbol) {
  const query = `book=${toBook(symbol)}`;
  const payload = await request('/ticker', query);
  const t = Array.isArray(payload) ? payload[0] : payload;
  if (!t) return null;
  const last = Number(t.last || 0);
  const change24 = Number(t.change_24 || 0);
  const percentage = change24 !== 0 && last - change24 > 0
    ? Number((change24 / (last - change24) * 100).toFixed(2))
    : null;
  return {
    symbol: symbol.toUpperCase(),
    last,
    ask: Number(t.ask),
    bid: Number(t.bid),
    high: Number(t.high),
    low: Number(t.low),
    percentage,
    change24,
    baseVolume: Number(t.volume || 0),
    quoteVolume: Number(t.vwap != null ? t.vwap * Number(t.volume || 0) : 0)
  };
}

export async function fetchTickers(symbols) {
  const out = {};
  for (const s of symbols) {
    try { out[s] = await fetchTicker(s); }
    catch { out[s] = null; }
  }
  return out;
}

// ---------- privado (ordenes/balance) ----------

const H = {
  'Content-Type': 'application/json'
};

function sign(secret, nonce, method, path, body) {
  const msg = `${nonce}${method}${path}${body || ''}`;
  return crypto.createHmac('sha256', secret).update(msg).digest('hex');
}

function nonceLocal() {
  return String(Date.now());
}

async function signedRequest(path, query = '', method = 'GET', body = null) {
  if (!CONFIG.BITSO_API_KEY || !CONFIG.BITSO_SECRET) {
    throw new Error('Faltan BITSO_API_KEY / BITSO_SECRET para mercado privado');
  }
  const nonce = nonceLocal();
  const bodyStr = body ? JSON.stringify(body) : '';
  // ccxt firma la ruta con prefijo /api/v3: version('/v3') + api
  const endpoint = `/api/v3${path}`;
  const qs = query ? `?${query}` : '';
  const signature = sign(CONFIG.BITSO_SECRET, nonce, method, endpoint + qs, bodyStr);
  const headers = {
    ...H,
    Authorization: `Bitso ${CONFIG.BITSO_API_KEY}:${nonce}:${signature}`
  };
  const res = await fetch(BASE + path + qs, { method, headers, body: bodyStr || undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Bitso privado HTTP ${res.status} para ${path}: ${text.slice(0, 120)}`);
  }
  if (!json.success) throw new Error(`Bitso privado error en ${path}: ${JSON.stringify(json.error || json)}`);
  return json.success === true ? json.payload : json;
}

// Balance real: payload.balances [{currency, available, locked, total}]
export async function fetchBalance() {
  const payload = await signedRequest('/balance');
  const list = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.balances) ? payload.balances : []);
  return list.map((b) => ({
    currency: String(b.currency).toUpperCase(),
    available: Number(b.available || 0),
    locked: Number(b.locked || 0),
    total: Number(b.total || 0),
    pending_deposit: Number(b.pending_deposit || 0),
    pending_withdrawal: Number(b.pending_withdrawal || 0)
  }));
}

// Ejecución de orden (mercado). Para trading real.
export async function createMarketOrder(symbol, side, amount, typeMajor = true) {
  const book = toBook(symbol);
const body = typeMajor
    ? { book, major: String(amount), side }
    : { book, minor: String(amount), side };
  return signedRequest('/orders/', '', 'POST', body);
}