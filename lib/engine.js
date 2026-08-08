import { CONFIG } from './config.js';
import { getSettings } from './settings.js';
import { analyzeMarket } from './analyzer.js';
import { listCryptoPairs, fetchOhlcv } from './bitso.js';
import {
  getBotState, updateBotState, logCycle, logSignal, logOrder, savePairsSnapshot
} from './supabase.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runCycle() {
  const started = new Date().toISOString();
  const settings = await getSettings();

  if (!settings.ENABLED) {
    const skipped = await logCycleSafe({ started, pairs: 0, decision: 'DISABLED', decision_reason: 'bot apagado en config' });
    return { started, disabled: true, message: 'bot deshabilitado en config', skipped };
  }

  let pairs = settings.SYMBOLS && settings.SYMBOLS.length
    ? settings.SYMBOLS.split(',').map(s => s.trim()).filter(Boolean)
    : await listCryptoPairs();

  if (pairs.length === 0) pairs = await listCryptoPairs();

  const ohlcvMap = {};
  for (const s of pairs) {
    try {
      ohlcvMap[s] = await fetchOhlcv(s, '1h', 168);
      await sleep(150);
    } catch (e) {
      console.log(`[observe] error OHLCV ${s}: ${e.message}`);
    }
  }

  const { results } = await analyzeMarket(ohlcvMap, pairs, settings);
  const best = results[0] || null;

  // Estado del bot (paper account / ultimo par)
  let state = null;
  try {
    const { data } = await getBotState();
    state = data;
  } catch { state = null; }
  if (!state) {
    const { data } = await updateBotStateSafe({
      paper_balance_mxn: settings.PAPER_INITIAL_BALANCE_MXN,
      current_symbol: best ? best.symbol : null,
      last_cycle: started
    });
    state = data || { paper_balance_mxn: settings.PAPER_INITIAL_BALANCE_MXN };
  } else {
    await updateBotStateSafe({ last_cycle: started, current_symbol: best ? best.symbol : state.current_symbol });
  }

  // Guardar snapshot
  const rows = results.map((r) => ({
    symbol: r.symbol,
    price: r.price,
    rsi: r.rsi,
    adx: r.adx,
    atr_pct: r.atrPct,
    bb_position: r.bb_position,
    ema20: r.ema20,
    trend_pct: r.trend_pct,
    vol24: r.vol24,
    score: r.score
  }));
  const saved = await savePairsSnapshotSafe(rows);

  // Decision
  const decision = makeDecision(best, state, settings);
  const signal = await logSignalSafe({ ...decision, created_at: new Date().toISOString() });

  // Ejecucion paper (o real si PAPER_MODE=false y hay keys)
  let orderResult = null;
  if (decision.action !== 'HOLD' && settings.PAPER_MODE) {
    orderResult = await paperExecute(decision, best, state, settings);
  }

  await logCycleSafe({
    started,
    pairs: pairs.length,
    best_symbol: best ? best.symbol : null,
    best_score: best ? best.score : null,
    decision: decision.action,
    decision_reason: decision.reason,
    paper_balance_mxn: state ? state.paper_balance_mxn : null
  });

  return { started, pairs: pairs.length, results, best, decision, order: orderResult, saved, settings };
}

function makeDecision(best, state, settings) {
  if (!best) return { action: 'HOLD', reason: 'sin datos' };
  const holdingSymbol = state ? state.current_symbol : null;

  // Si ya estamos en un par, decidir salida
  if (holdingSymbol && best.symbol === holdingSymbol) {
    if (best.rsi !== null && best.rsi >= settings.RSI_EXIT) {
      return { action: 'SELL', symbol: best.symbol, reason: `RSI ${best.rsi.toFixed(1)} >= exit ${settings.RSI_EXIT}` };
    }
    return { action: 'HOLD', symbol: holdingSymbol, reason: 'en posicion, sin senal de salida' };
  }

  // Entrada por oversold
  if (best && best.rsi !== null && best.rsi <= settings.RSI_ENTRY) {
    return { action: 'BUY', symbol: best.symbol, reason: `RSI ${best.rsi.toFixed(1)} <= entry ${settings.RSI_ENTRY}, score ${best.score}` };
  }
  return { action: 'HOLD', symbol: best ? best.symbol : null, reason: `RSI ${best && best.rsi !== null ? best.rsi.toFixed(1) : 'n/a'} > entry, score ${best ? best.score : 0}` };
}

async function paperExecute(decision, best, state, settings) {
  try {
    const amount = Math.min(settings.MAX_AMOUNT_PER_TRADE_MXN, state.paper_balance_mxn || 0);
    if (decision.action === 'BUY') {
      const units = amount / best.price;
      const newBalance = (state.paper_balance_mxn || 0) - amount;
      await updateBotStateSafe({ paper_balance_mxn: newBalance, current_symbol: best.symbol });
      const order = await logOrderSafe({
        action: 'BUY', symbol: best.symbol, price: best.price, units,
        amount_mxn: amount, fee_mxn: amount * 0.0078, type: 'paper'
      });
      return order;
    }
    if (decision.action === 'SELL') {
      await updateBotStateSafe({ current_symbol: null });
      const order = await logOrderSafe({
        action: 'SELL', symbol: best.symbol, price: best.price, units: 0,
        amount_mxn: amount, type: 'paper'
      });
      return order;
    }
  } catch (e) {
    return { error: e.message };
  }
  return null;
}

// Helpers que nunca lanzan si la tabla no existe (primer deploy antes de SQL)
async function updateBotStateSafe(patch) {
  try { return await updateBotState(patch); } catch { return { data: null }; }
}
async function savePairsSnapshotSafe(rows) {
  try { return await savePairsSnapshot(rows); } catch (e) { return { skipped: true, error: e.message }; }
}
async function logCycleSafe(info) {
  try { return await logCycle(info); } catch (e) { return { skipped: true }; }
}
async function logSignalSafe(sig) {
  try { return await logSignal(sig); } catch (e) { return { skipped: true }; }
}
async function logOrderSafe(order) {
  try { return await logOrder(order); } catch (e) { return { skipped: true }; }
}