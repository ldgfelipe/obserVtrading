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
    explanation: decision.explanation,
    paper_balance_mxn: state ? state.paper_balance_mxn : null
  });

  return { started, pairs: pairs.length, results, best, decision, order: orderResult, saved, settings };
}

function humanAction(action) {
  if (action === 'BUY') return 'COMPRAR';
  if (action === 'SELL') return 'VENDER';
  return 'ESPERAR';
}

function makeDecision(best, state, settings) {
  if (!best) return { action: 'HOLD', reason: 'sin datos', explanation: 'No hay datos de mercado disponibles para analizar.' };  const holdingSymbol = state ? state.current_symbol : null;
  const strat = settings.STRATEGY || 'momentum';

  if (strat === 'grid') {
    return gridDecision(best, state, settings, holdingSymbol);
  }

  // ---------- momentum ----------
  // Si ya estamos en un par, decidir salida
  if (holdingSymbol && best.symbol === holdingSymbol) {
    if (best.rsi !== null && best.rsi >= settings.RSI_EXIT) {
      return {
        action: 'SELL',
        symbol: best.symbol,
        reason: `RSI ${best.rsi.toFixed(1)} >= exit ${settings.RSI_EXIT}`,
        explanation: `VENDER ${best.symbol}: el RSI de ${best.rsi.toFixed(1)} indica que el activo ya se encarecio (sobrecompra). Es buen momento para tomar ganancias antes de que el precio baje.`
      };
    }
    return {
      action: 'HOLD',
      symbol: holdingSymbol,
      reason: 'en posicion, sin senal de salida',
      explanation: `ESPERAR ${holdingSymbol}: ya estamos invertidos y el RSI de ${best.rsi === null ? 'n/a' : best.rsi.toFixed(1)} todavia no indica que este caro. Mejor mantener la posicion.`
    };
  }

  // Entrada por oversold
  if (best && best.rsi !== null && best.rsi <= settings.RSI_ENTRY) {
    return {
      action: 'BUY',
      symbol: best.symbol,
      reason: `RSI ${best.rsi.toFixed(1)} <= entry ${settings.RSI_ENTRY}, score ${best.score}`,
      explanation: `COMPRAR ${best.symbol}: el RSI de ${best.rsi.toFixed(1)} indica que el precio esta barato (${best.rsi < 30 ? 'muy barato' : 'en zona de oportunidad'}). ${best.why ? best.why.slice(0, 2).join(' ') : ''}`
    };
  }
  return {
    action: 'HOLD',
    symbol: best ? best.symbol : null,
    reason: `RSI ${best && best.rsi !== null ? best.rsi.toFixed(1) : 'n/a'} > entry, score ${best ? best.score : 0}`,
    explanation: `ESPERAR ${best ? best.symbol : ''}: el RSI de ${best && best.rsi !== null ? best.rsi.toFixed(1) : 'n/a'} esta por encima del umbral de compra (${settings.RSI_ENTRY}). Esperamos a que el precio baje a zona de oportunidad. ${best && best.why ? best.why[0] : ''}`
  };
}

// Grid: compra en niveles bajos y vende en niveles altos dentro de un rango
function gridDecision(best, state, settings, holdingSymbol) {
  const price = best.price;
  const rangePct = (settings.GRID_RANGE_PCT || 5) / 100;
  const mid = price; // centro = precio actual
  const low = mid * (1 - rangePct);
  const high = mid * (1 + rangePct);
  const levels = settings.GRID_LEVELS || 6;
  const step = (high - low) / levels;

  // Si el precio bajo de nuestra compra previa (estamos en posicion), esperar
  if (holdingSymbol && best.symbol === holdingSymbol) {
    if (price >= high) {
      return {
        action: 'SELL',
        symbol: best.symbol,
        reason: `grid: precio ${price} >= techo ${high.toFixed(2)}`,
        explanation: `VENDER ${best.symbol}: el precio (${price.toLocaleString()}) llego al techo superior del grid (${high.toFixed(2)}). El bot toma ganancias del rango.`
      };
    }
    return {
      action: 'HOLD',
      symbol: holdingSymbol,
      reason: `grid: en rango, precio ${price}, techo ${high.toFixed(2)}`,
      explanation: `ESPERAR ${holdingSymbol}: el precio (${price.toLocaleString()}) sigue dentro del grid (piso ${low.toFixed(2)} - techo ${high.toFixed(2)}). El bot espera que toque el techo para vender.`
    };
  }

  // Compra escalonada: cada nivel mas bajo compra una porcion
  const dropFromMid = (mid - price) / mid * 100;
  if (price <= low) {
    return {
      action: 'BUY',
      symbol: best.symbol,
      reason: `grid: precio ${price} <= piso ${low.toFixed(2)} (${dropFromMid.toFixed(1)}% bajo el centro)`,
      explanation: `COMPRAR ${best.symbol}: el precio (${price.toLocaleString()}) toco el piso del grid (${low.toFixed(2)}), ${dropFromMid.toFixed(1)}% por debajo del centro. El bot compra barato y esperara a que suba hasta el techo para vender.`
    };
  }
  return {
    action: 'HOLD',
    symbol: best.symbol,
    reason: `grid: precio ${price} entre piso ${low.toFixed(2)} y techo ${high.toFixed(2)}`,
    explanation: `ESPERAR ${best.symbol}: el precio (${price.toLocaleString()}) esta dentro del rango del grid (${low.toFixed(2)} a ${high.toFixed(2)}). El bot comprara cuando baje al piso (${(rangePct * 100).toFixed(1)}% mas abajo).`
  };
}

async function paperExecute(decision, best, state, settings) {
  try {
    const balance = state.paper_balance_mxn || 0;
    let amount;
    if (settings.INVEST_MODE === 'percent') {
      amount = balance * ((settings.INVEST_PERCENT || 10) / 100);
    } else {
      amount = settings.MAX_AMOUNT_PER_TRADE_MXN;
    }
    amount = Math.max(0, Math.min(amount, balance));
    if (decision.action === 'BUY') {
      const units = amount / best.price;
      const newBalance = balance - amount;
      await updateBotStateSafe({ paper_balance_mxn: newBalance, current_symbol: best.symbol });
      const order = await logOrderSafe({
        action: 'BUY', symbol: best.symbol, price: best.price, units,
        amount_mxn: amount, fee_mxn: amount * 0.0078, type: 'paper'
      });
      return { ...order, amount, explanation: decision.explanation };
    }
    if (decision.action === 'SELL') {
      await updateBotStateSafe({ current_symbol: null });
      const order = await logOrderSafe({
        action: 'SELL', symbol: best.symbol, price: best.price, units: 0,
        amount_mxn: amount, type: 'paper'
      });
      return { ...order, amount, explanation: decision.explanation };
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