import { getSettings } from '../lib/settings.js';
import { fetchOhlcv, listCryptoPairs, fetchBalance } from '../lib/bitso.js';
import { analyzeMarket } from '../lib/analyzer.js';
import { CONFIG } from '../lib/config.js';
import {
  getBotState, getLatestPairs, getLastSignal, getLastOrder,
  getCycles, getSignals, getOrders
} from '../lib/supabase.js';

export default async function handler(req, res) {
  const startTs = Date.now();
  console.log('[dashboard] inicio', new Date().toISOString());
  console.log('[dashboard] env: BITSO_API_KEY=', CONFIG.BITSO_API_KEY ? 'configurada' : 'VACIA',
    '| BITSO_SECRET=', CONFIG.BITSO_SECRET ? 'configurado' : 'VACIO',
    '| SUPABASE_URL=', CONFIG.SUPABASE_URL ? 'configurada' : 'VACIA');
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
    console.log('[dashboard] consultando balance Bitso...');
    const balance = await safeTry(async () => {
      const b = await fetchBalance();
      return { ok: true, items: b, ts: new Date().toISOString() };
    });
    if (balance.ok) {
      console.log('[dashboard] balance OK, items:', balance.items.length,
        '| no-cero:', balance.items.filter(x => Number(x.total) > 0).length);
    } else {
      console.error('[dashboard] balance ERROR:', balance.error);
    }

    console.log('[dashboard] fin, duracion ms:', Date.now() - startTs);
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
    console.error('[dashboard] ERROR general:', e.message, '\n', e.stack);
    res.status(500).json({ ok: false, error: e.message, stack: e.stack });
  }
}

async function safe(fn, dflt) {
  try { return await fn(); } catch (e) { console.error('[dashboard] safe fallback:', e.message); return dflt; }
}

async function safeTry(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('[dashboard] safeTry fallback:', e.message);
    return { ok: false, items: [], ts: new Date().toISOString(), error: e.message };
  }
}