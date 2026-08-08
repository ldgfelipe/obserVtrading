import fs from 'node:fs';

function loadConfig() {
  const result = {};
  const keys = [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'BITSO_API_KEY', 'BITSO_SECRET',
    'PAPER_MODE', 'PAPER_INITIAL_BALANCE_MXN',
    'SYMBOLS', 'INTERVAL_MINUTES',
    'QUANT_STOP_LOSS_PCT', 'QUANT_TAKE_PROFIT_PCT',
    'RSI_ENTRY', 'RSI_EXIT', 'MAX_AMOUNT_PER_TRADE_MXN',
    'ADX_RANGE_THRESHOLD'
  ];
  for (const k of keys) result[k] = process.env[k];

  // Cargar .env.local en dev (si existe) sin sobrescribir env ya definidas
  try {
    const p = new URL('../.env.local', import.meta.url);
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
    PAPER_MODE: (result.PAPER_MODE ?? 'true').toString().toLowerCase() === 'true',
    PAPER_INITIAL_BALANCE_MXN: Number(result.PAPER_INITIAL_BALANCE_MXN || 2000),
    SYMBOLS: (result.SYMBOLS || '').split(',').map(s => s.trim()).filter(Boolean),
    INTERVAL_MINUTES: Number(result.INTERVAL_MINUTES || 1440),
    QUANT_STOP_LOSS_PCT: Number(result.QUANT_STOP_LOSS_PCT || 3),
    QUANT_TAKE_PROFIT_PCT: Number(result.QUANT_TAKE_PROFIT_PCT || 5),
    RSI_ENTRY: Number(result.RSI_ENTRY || 55),
    RSI_EXIT: Number(result.RSI_EXIT || 45),
    MAX_AMOUNT_PER_TRADE_MXN: Number(result.MAX_AMOUNT_PER_TRADE_MXN || 50),
    ADX_RANGE_THRESHOLD: Number(result.ADX_RANGE_THRESHOLD || 25)
  };
}

export const CONFIG = loadConfig();