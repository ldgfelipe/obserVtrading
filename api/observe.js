import { CONFIG } from '../lib/config.js';

export default async function handler(req, res) {
  try {
    const { runCycle } = await import('../lib/engine.js');
    // proteger endpoint: opcional usar header x-vercel-cron o token
    const isCron = req.headers['x-vercel-cron'] !== undefined;
    const token = req.headers['authorization'];
    const expected = process.env.CRON_SECRET || '';
    if (!isCron && expected && token !== `Bearer ${expected}`) {
      return res.status(401).json({ ok: false, error: 'no autorizado' });
    }
    const out = await runCycle();
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, stack: e.stack });
  }
}