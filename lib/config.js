import fs from 'node:fs';

// SOLO credenciales leidas desde variables de entorno.
// Los parametros operativos (PAPER_MODE, RSI, montos, etc.) viven en
// Supabase (tabla bot_settings) y se editan desde el panel admin.
function loadConfig() {
  const keys = [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'BITSO_API_KEY', 'BITSO_SECRET',
    'ADMIN_TOKEN'
  ];
  const result = {};
  for (const k of keys) result[k] = process.env[k];

  // dev: cargar .env (si existe) sin sobrescribir env ya definidas
  try {
    const p = new URL('../.env', import.meta.url);
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) {
          const v = m[2].replace(/^["']|["']$/g, '');
          process.env[m[1]] = v;
          result[m[1]] = v;
        }
      }
    }
  } catch { /* noop */ }

  return {
    SUPABASE_URL: result.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: result.SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: result.SUPABASE_SERVICE_ROLE_KEY || '',
    BITSO_API_KEY: result.BITSO_API_KEY || '',
    BITSO_SECRET: result.BITSO_SECRET || '',
    ADMIN_TOKEN: result.ADMIN_TOKEN || ''
  };
}

export const CONFIG = loadConfig();