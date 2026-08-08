import { CONFIG } from '../lib/config.js';

export default async function handler(req, res) {
  try {
    const { runCycle } = await import('../lib/engine.js');
    const out = await runCycle();
    // ciclo manual (dev/testing)
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}