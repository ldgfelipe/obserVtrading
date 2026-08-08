import { getSupabase } from './supabase.js';

// Parametros operativos editables desde el panel admin.
// Se guardan como JSONB en la tabla bot_settings.columna `config`.
export const DEFAULT_SETTINGS = {
  ENABLED: true,
  PAPER_MODE: true,
  PAPER_INITIAL_BALANCE_MXN: 2000,
  SYMBOLS: 'BTC/MXN,ETH/MXN,SOL/MXN,XRP/MXN,LTC/MXN',
  INTERVAL_MINUTES: 1440,
  QUANT_STOP_LOSS_PCT: 3.0,
  QUANT_TAKE_PROFIT_PCT: 5.0,
  RSI_ENTRY: 55,
  RSI_EXIT: 45,
  MAX_AMOUNT_PER_TRADE_MXN: 50,
  ADX_RANGE_THRESHOLD: 25
};

const TABLE = 'bot_settings';

function normalize(raw) {
  const base = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  return {
    ...base,
    ENABLED: toBool(base.ENABLED, true),
    PAPER_MODE: toBool(base.PAPER_MODE, true),
    PAPER_INITIAL_BALANCE_MXN: toNum(base.PAPER_INITIAL_BALANCE_MXN, 2000),
    INTERVAL_MINUTES: toNum(base.INTERVAL_MINUTES, 1440),
    QUANT_STOP_LOSS_PCT: toNum(base.QUANT_STOP_LOSS_PCT, 3),
    QUANT_TAKE_PROFIT_PCT: toNum(base.QUANT_TAKE_PROFIT_PCT, 5),
    RSI_ENTRY: toNum(base.RSI_ENTRY, 55),
    RSI_EXIT: toNum(base.RSI_EXIT, 45),
    MAX_AMOUNT_PER_TRADE_MXN: toNum(base.MAX_AMOUNT_PER_TRADE_MXN, 50),
    ADX_RANGE_THRESHOLD: toNum(base.ADX_RANGE_THRESHOLD, 25)
  };
}

function toBool(v, dflt) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return dflt;
}

function toNum(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

export async function getSettings() {
  try {
    const sb = getSupabase();
    const { data } = await sb.from(TABLE).select('config').maybeSingle();
    return normalize(data && data.config);
  } catch {
    return normalize(null);
  }
}

// Guarda solo las claves conocidas (union con current)
export async function updateSettings(patch) {
  const sb = getSupabase();
  const current = await getSettings();
  const narrowed = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (k in patch) narrowed[k] = patch[k];
  }
  const merged = normalize({ ...current, ...narrowed });
  const { data, error } = await sb.from(TABLE)
    .upsert({ id: 1, config: merged, updated_at: new Date().toISOString() })
    .select('config')
    .single();
  if (error) throw new Error(`settings: ${error.message}`);
  return normalize(data && data.config);
}