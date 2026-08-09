import { CONFIG } from '../lib/config.js';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '../lib/settings.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const settings = await getSettings();
      res.status(200).json({ ok: true, settings, defaults: DEFAULT_SETTINGS });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const token = (req.headers['authorization'] || '').trim();
    const expectedToken = (CONFIG.ADMIN_TOKEN || '').trim();
    const expected = `Bearer ${expectedToken}`;
    
    if (!expectedToken) {
      res.status(500).json({ ok: false, error: 'ADMIN_TOKEN no configurado en el servidor (variables de entorno)' });
      return;
    }
    if (token !== expected) {
      res.status(401).json({ ok: false, error: 'No autorizado: token inválido o ausente' });
      return;
    }
    const body = (typeof req.body === 'object' && req.body) ? req.body : {};
    try {
      const settings = await updateSettings(body);
      res.status(200).json({ ok: true, settings });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'Metodo no permitido' });
}