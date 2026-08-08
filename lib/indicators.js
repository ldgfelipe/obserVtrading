// Indicadores tecnicos portados de la version Python (bot Windows original)

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d >= 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values, period) {
  if (!values.length) return null;
  const k = 2 / (period + 1);
  let prev = values[0];
  let isSeed = true;
  for (let i = 1; i < values.length; i++) {
    if (isSeed) {
      // seed con SMA del primer periodo
      if (i >= period) {
        prev = values.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
        isSeed = false;
      } else prev = values[i];
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
  }
  return prev;
}

export function atr(highs, lows, closes, period = 14) {
  if (highs.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trs.push(Math.max(hl, hc, lc));
  }
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) {
    a = (a * (period - 1) + trs[i]) / period;
  }
  return a;
}

export function adx(highs, lows, closes, period = 14) {
  if (highs.length < period * 2) return null;
  const trs = [], pdm = [], mdm = [];
  for (let i = 1; i < highs.length; i++) {
    const up = highs[i] - highs[i - 1];
    const dn = lows[i - 1] - lows[i];
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
  }
  let at = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let ap = pdm.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let am = mdm.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let dxs = [];
  for (let i = period; i < trs.length; i++) {
    at = (at * (period - 1) + trs[i]) / period;
    ap = (ap * (period - 1) + pdm[i]) / period;
    am = (am * (period - 1) + mdm[i]) / period;
    const pdi = (ap / at) * 100;
    const mdi = (am / at) * 100;
    const sum = pdi + mdi;
    dxs.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }
  const last = dxs.slice(-period);
  return last.length ? last.reduce((a, b) => a + b, 0) / last.length : null;
}

export function bollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return { upper: null, mid: null, lower: null, position: null };
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = mid + mult * std;
  const lower = mid - mult * std;
  const last = closes[closes.length - 1];
  const position = upper === lower ? 0.5 : (last - lower) / (upper - lower);
  return { upper, mid, lower, position };
}

export function changePct(closes, periods = 24) {
  if (closes.length < periods + 1) return null;
  const first = closes[closes.length - 1 - periods];
  const last = closes[closes.length - 1];
  return ((last - first) / first) * 100;
}