import { fetchTickers } from '../lib/bitso.js';
import { listCryptoPairs } from '../lib/bitso.js';
import { getLatestPairs, getLastSignal, getLastOrder } from '../lib/supabase.js';

export default async function handler(req, res) {
  try {
    const pairs = await listCryptoPairs();
    const data = await getLatestPairs();
    const signal = await getLastSignal();
    const order = await getLastOrder();
    res.status(200).json({
      ok: true,
      pairs: pairs.map((s) => s.replace(/\/MXN.*/, '/MXN')),
      pairsCount: pairs.length,
      latestSnapshop: data.error ? { error: data.error.message } : data.data,
      lastSignal: signal.error ? null : signal.data,
      lastOrder: order.error ? null : order.data
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}