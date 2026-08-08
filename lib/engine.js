import { CONFIG } from './config.js';
import { analyzeMarket } from './analyzer.js';
import { listCryptoPairs, fetchOhlcv, getExchange } from './bitso.js';
import {
  getBotState, updateBotState, logCycle, logSignal, logOrder, savePairsSnapshot
} from './supabase.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runCycle() {
  const started = new Date().toISOString();
  let pairs = CONFIG.SYMBOLS.length ? CONFIG.SYMBOLS : await listCryptoPairs();

  const ohlcvMap = {};
  for (const s of pairs) {
    try {
      ohlcvMap[s] = await fetchOhlcv(s, '1h', 168);
      await sleep(150);
    } catch (e) {
      console.log(`[observe] error OHLCV ${s}: ${e.message}`);
    }
  }

  const { results } = await analyzeMarket(ohlcvMap, pairs);
  const best = results[0] || null;

  // Estado del bot (paper account / ultimo par)
  let state = null;
  try {
    const { data } = await getBotState();
    state = data;
  } catch { state = null; }
  if (!state) {
    const { data, error } = await updateBotState({
      paper_balance_mxn: CONFIG.PAPER_INITIAL_BALANCE_MXN,
      current_symbol: best ? best.symbol : null,
      last_cycle: started
    });
    state = data || { paper_balance_mxn: CONFIG.PAPER_INITIAL_BALANCE_MXN };
  } else {
    await updateBotState({ last_cycle: started, current_symbol: best ? best.symbol : state.current_symbol });
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

  // Decisión (estrategia de compra en RSI/oversold + exit con take-profit)
  const decision = makeDecision(best, state);
  const signal = await logSignalSafe({ ...decision, created_at: new Date().toISOString() });

  // Ejecución paper
  let orderResult = null;
  if (decision.action !== 'HOLD' && CONFIG.PAPER_MODE) {
    orderResult = await paperExecute(decision, best, state);
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

  return { started, pairs: pairs.length, results, best, decision, order: orderResult, saved };
}

function makeDecision(best, state) {
  if (!best) return { action: 'HOLD', reason: 'sin datos' };
  const holdingSymbol = state ? state.current_symbol : null;

  // Si ya estamos en un par, decidir salida
  if (holdingSymbol && best && best.symbol === holdingSymbol) {
    if (best.rsi !== null && best.rsi >= CONFIG.RSI_EXIT) {
      return { action: 'SELL', symbol: best.symbol, reason: `RSI ${best.rsi.toFixed(1)} >= exit ${CONFIG.RSI_EXIT}` };
    }
    return { action: 'HOLD', symbol: holdingSymbol, reason: 'en posicion, sin señal de salida' };
  }

  // Entrada por oversold
  if (best && best.rsi !== null && best.rsi <= CONFIG.RSI_ENTRY) {
    return { action: 'BUY', symbol: best.symbol, reason: `RSI ${best.rsi.toFixed(1)} <= entry ${CONFIG.RSI_ENTRY}, score ${best.score}` };
  }
  return { action: 'HOLD', symbol: best ? best.symbol : null, reason: `RSI ${best && best.rsi !== null ? best.rsi.toFixed(1) : 'n/a'} > entry, score ${best ? best.score : 0}` };
}

async function paperExecute(decision, best, state) {
  try {
    const amount = Math.min(CONFIG.MAX_AMOUNT_PER_TRADE_MXN, state.paper_balance_mxn || 0);
    if (decision.action === 'BUY') {
      const units = amount / best.price;
      const newBalance = (state.paper_balance_mxn || 0) - amount;
      await updateBotState({ paper_balance_mxn: newBalance, current_symbol: best.symbol });
      const order = await logOrderSafe({
        action: 'BUY', symbol: best.symbol, price: best.price, units,
        amount_mxn: amount, fee_mxn: amount * 0.0078, type: 'paper'
      });
      return order;
    }
    if (decision.action === 'SELL') {
      await updateBotState({ current_symbol: null });
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