import { fetchTickers } from './bitso.js';
import { rsi, adx, atr, bollinger, ema, changePct } from './indicators.js';

// Port del pair_selector.py: scoring de los pares disponibles

function buildScore(ohlcv, ticker, settings) {
  if (!ohlcv || ohlcv.length < 40 || !ticker) return null;
  const closes = ohlcv.map((c) => c.close);
  const highs = ohlcv.map((c) => c.high);
  const lows = ohlcv.map((c) => c.low);
  const last = ohlcv[ohlcv.length - 1].close;

  const rsiVal = rsi(closes, 14);
  const atrVal = atr(highs, lows, closes, 14);
  const atrPct = atrVal && last ? (atrVal / last) * 100 : null;
  const adxVal = adx(highs, lows, closes, 14);
  const bb = bollinger(closes, 20, 2);
  const ema20 = ema(closes, 20);
  const trend = ema20 ? ((last - ema20) / ema20) * 100 : 0;
  const vol4 = changePct(closes, 4);

  const adxThreshold = settings && settings.ADX_RANGE_THRESHOLD ? settings.ADX_RANGE_THRESHOLD : 25;

  let score = 0;
  const why = [];

  if (rsiVal !== null) {
    if (rsiVal < 30) { score += 40; why.push(`RSI ${rsiVal.toFixed(1)}: muy barato (sobreventa), buena oportunidad de compra`); }
    else if (rsiVal < 40) { score += 30; why.push(`RSI ${rsiVal.toFixed(1)}: barato, cerca de zona de compra`); }
    else if (rsiVal < 50) { score += 15; why.push(`RSI ${rsiVal.toFixed(1)}: neutral-bajista, leve inclinacion a comprar`); }
    else if (rsiVal > 70) { score -= 20; why.push(`RSI ${rsiVal.toFixed(1)}: muy caro (sobrecompra), momento de vender`); }
    else why.push(`RSI ${rsiVal.toFixed(1)}: neutral, sin exceso de precio`);
  }
  if (adxVal !== null) {
    if (adxVal < adxThreshold) { score += 20; why.push(`ADX ${adxVal.toFixed(1)}: mercado sin tendencia fuerte, precio estable (ideal para comprar barato y esperar)`); }
    else if (adxVal < 30) { score += 10; why.push(`ADX ${adxVal.toFixed(1)}: tendencia moderada`); }
    else { score -= 10; why.push(`ADX ${adxVal.toFixed(1)}: tendencia muy fuerte, el movimiento ya fue grande`); }
  }
  if (atrPct !== null) {
    if (atrPct > 0.2 && atrPct < 1.2) { score += 15; why.push(`Volatilidad ${atrPct.toFixed(2)}%: rango saludable para operar`); }
    else if (atrPct <= 0.2) { score += 5; why.push(`Volatilidad ${atrPct.toFixed(2)}%: muy calmado, pocas oportunidades`); }
    else { why.push(`Volatilidad ${atrPct.toFixed(2)}%: demasiado volatil, riesgo alto`); }
  }
  if (bb.position !== null && bb.position < 0.3) { score += 15; why.push(`Precio cerca del piso (Banda de Bollinger posicion ${bb.position.toFixed(2)}): podria rebotar al alza`); }
  if (vol4 !== null) {
    if (vol4 > 2 && vol4 < 8) { score += 10; why.push(`Subio ${vol4.toFixed(1)}% en las ultimas velas: impulso positivo`); }
    else if (vol4 < -8) { score -= 15; why.push(`Cayo ${vol4.toFixed(1)}% en las ultimas velas: impulso negativo, evitar comprar`); }
    else if (vol4 >= 8) { why.push(`Subio ${vol4.toFixed(1)}% en las ultimas velas: subida muy rapida, esperar retroceso`); }
  }
  if (trend !== 0) {
    if (trend > 0) why.push(`Precio ${trend.toFixed(1)}% arriba de su media de 20 velas (EMA20): tendencia alcista de corto plazo`);
    else why.push(`Precio ${trend.toFixed(1)}% abajo de su media de 20 velas (EMA20): tendencia bajista de corto plazo`);
  }
  if (why.length === 0) why.push('Indicadores dentro de rangos normales: sin accion clara');

  return {
    symbol: ticker.symbol,
    price: last,
    rsi: rsiVal,
    adx: adxVal,
    atrPct,
    bb_position: bb.position,
    ema20,
    trend_pct: trend,
    vol24: typeof ticker.percentage === 'number' ? ticker.percentage : vol4,
    score,
    why
  };
}

export async function analyzeMarket(ohlcvMap, symbols, settings) {
  const tickers = await fetchTickers(symbols);
  const results = [];
  for (const s of symbols) {
    const o = ohlcvMap[s] || [];
    const t = tickers[s] || null;
    const r = buildScore(o, t, settings);
    if (r) results.push(r);
  }
  results.sort((a, b) => b.score - a.score);
  return { results, tickers };
}