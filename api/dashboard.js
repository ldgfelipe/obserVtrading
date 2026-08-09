import { getSettings } from '../lib/settings.js';
import { fetchOhlcv, listCryptoPairs, fetchBalance } from '../lib/bitso.js';
import { analyzeMarket } from '../lib/analyzer.js';
import {
  getBotState, getLatestPairs, getLastSignal, getLastOrder,
  getCycles, getSignals, getOrders
} from '../lib/supabase.js';

export default async function handler(req, res) {
  try {
    const settings = await getSettings();

    let pairs = settings.SYMBOLS && settings.SYMBOLS.length
      ? settings.SYMBOLS.split(',').map(s => s.trim()).filter(Boolean)
      : await listCryptoPairs();
    if (pairs.length === 0) pairs = await listCryptoPairs();

    // Indicadores en vivo (max 6 pares para no alentar la request)
    const livePairs = pairs.slice(0, 6);
    const ohlcvMap = {};
    for (const s of livePairs) {
      try { ohlcvMap[s] = await fetchOhlcv(s, '1h', 100); } catch { ohlcvMap[s] = []; }
    }
    const { results } = await analyzeMarket(ohlcvMap, livePairs, settings);

    // Registros desde Supabase (con fallback ante tablas ausentes)
    const snapshots = await safe(async () => (await getLatestPairs()).data, []);
    const cycles = await safe(async () => (await getCycles(15)).data, []);
    const signals = await safe(async () => (await getSignals(15)).data, []);
    const orders = await safe(async () => (await getOrders(15)).data, []);
    const botState = await safe(async () => {
      const r = await getBotState();
      return r.error ? null : r.data;
    }, null);

    // Balance real de Bitso (requiere keys privadas)
    const balance = await safe(async () => {
      const b = await fetchBalance();
      return { ok: true, items: b, ts: new Date().toISOString() };
    }, { ok: false, items: [], ts: new Date().toISOString(), error: 'Faltan BITSO_API_KEY / BITSO_SECRET en Vercel' });

    res.status(200).json({
      ok: true,
      ts: new Date().toISOString(),
      settings,
      market: results,
      balance,
      snapshots: snapshots.slice(0, 40),
      cycles,
      signals,
      orders,
      botState
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, stack: e.stack });
  }
}

async function safe(fn, dflt) {
  try { return await fn(); } catch { return dflt; }
}