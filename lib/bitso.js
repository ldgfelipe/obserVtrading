import ccxt from 'ccxt';
import { CONFIG } from './config.js';

let exchange = null;

export async function getExchange() {
  if (!exchange) {
    const cfg = { enableRateLimit: true, timeout: 30000 };
    if (CONFIG.BITSO_API_KEY && CONFIG.BITSO_SECRET) {
      cfg.apiKey = CONFIG.BITSO_API_KEY;
      cfg.secret = CONFIG.BITSO_SECRET;
    }
    exchange = new ccxt.bitso(cfg);
    await exchange.loadMarkets();
  }
  return exchange;
}

// Stablecoins / fiat que NO son cripto operables
const STABLE_BASES = new Set([
  'USDT', 'USDS', 'USDC', 'PYUSD', 'RLUSD', 'TUSD', 'DAI', 'EUR', 'USD', 'MXNC'
]);

export async function listCryptoPairs() {
  const ex = await getExchange();
  const seen = new Set();
  const pairs = [];
  for (const symbol of Object.keys(ex.markets)) {
    const m = ex.markets[symbol];
    if (m.active === false) continue;
    if (m.quote !== 'MXN') continue;
    if (STABLE_BASES.has(m.base)) continue;
    if (seen.has(m.base)) continue;
    seen.add(m.base);
    pairs.push(symbol);
  }
  pairs.sort();
  return pairs;
}

export async function fetchOhlcv(symbol, timeframe = '1h', limit = 168) {
  const ex = await getExchange();
  const symbols = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
  return symbols.map((r) => ({
    timestamp: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5]
  }));
}

export async function fetchTicker(symbol) {
  const ex = await getExchange();
  const t = await ex.fetchTicker(symbol);
  return {
    symbol,
    last: t.last,
    ask: t.ask,
    bid: t.bid,
    high: t.high,
    low: t.low,
    percentage: t.percentage,
    baseVolume: t.baseVolume,
    quoteVolume: t.quoteVolume
  };
}

export async function fetchTickers(symbols) {
  const ex = await getExchange();
  const out = {};
  for (const s of symbols) {
    try { out[s] = await ex.fetchTicker(s); } catch { out[s] = null; }
  }
  return out;
}