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
  if (rsiVal !== null) {
    if (rsiVal < 30) score += 40;
    else if (rsiVal < 40) score += 30;
    else if (rsiVal < 50) score += 15;
    else if (rsiVal > 70) score -= 20;
  }
  if (adxVal !== null) {
    if (adxVal < adxThreshold) score += 20;
    else if (adxVal < 30) score += 10;
    else score -= 10;
  }
  if (atrPct !== null) {
    if (atrPct > 0.2 && atrPct < 1.2) score += 15;
    else if (atrPct <= 0.2) score += 5;
  }
  if (bb.position !== null && bb.position < 0.3) score += 15;
  if (vol4 !== null) {
    if (vol4 > 2 && vol4 < 8) score += 10;
    else if (vol4 < -8) score -= 15;
  }

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
    score
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