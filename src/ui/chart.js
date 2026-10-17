const PALETTE = ['#6aa8ff', '#ff6a5c', '#5ed37a', '#ffc94a', '#c58cff', '#4ad8d8'];

const fmtNum = (v) => (Number.isFinite(v) ? +v.toPrecision(4) : '—');

/**
 * Screen points for one series. Whatever has been recorded is stretched across
 * the full width (so a fresh chart is readable at once), and the series is
 * normalised to its own range so different units can share the plot.
 */
export function seriesPoints(data, { x0, y0, width, height }) {
  if (data.length < 2) return [];
  let lo = Infinity, hi = -Infinity;
  for (const v of data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 1e-12 * Math.max(1, Math.abs(hi))) { hi += 1; lo -= 1; }
  const n = data.length - 1;
  return data.map((v, i) => [x0 + (i / n) * width, y0 + (1 - (v - lo) / (hi - lo)) * height]);
}

/** Multi-series time chart drawn on a canvas. */
export class Chart {
  constructor(canvas, maxPoints = 400) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = maxPoints;
    this.timeUnit = '';
    this.reset([]);
  }

  reset(series, timeUnit = this.timeUnit) {
    this.series = series.map((s, i) => ({ ...s, color: s.color ?? PALETTE[i % PALETTE.length], data: [] }));
    this.times = [];
    this.timeUnit = timeUnit;
  }

  push(values) {
    for (const s of this.series) {
      const v = values[s.key];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      s.data.push(v);
      if (s.data.length > this.maxPoints) s.data.shift();
    }
    if (Number.isFinite(values.time)) {
      this.times.push(values.time);
      if (this.times.length > this.maxPoints) this.times.shift();
    }
  }

  draw() {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = 6, legendH = 16, footH = 13;
    const plot = { x0: pad, y0: legendH + 2, width: w - 2 * pad, height: h - legendH - footH - 4 };

    // Legend: current value and the range shown, per series.
    ctx.font = '10px system-ui, sans-serif';
    let lx = pad;
    for (const s of this.series) {
      const last = s.data.length ? s.data[s.data.length - 1] : NaN;
      let lo = Infinity, hi = -Infinity;
      for (const v of s.data) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const range = s.data.length > 1 && hi > lo ? `  (${fmtNum(lo)} … ${fmtNum(hi)})` : '';
      const text = `${s.label}: ${fmtNum(last)}${range}`;
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, 5, 8, 3);
      ctx.fillText(text, lx + 11, 11);
      lx += ctx.measureText(text).width + 24;
    }

    // Light gridlines at the top, middle and bottom of every series' range.
    ctx.strokeStyle = 'rgba(120,140,190,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const f of [0, 0.5, 1]) {
      const y = Math.round(plot.y0 + f * plot.height) + 0.5;
      ctx.moveTo(plot.x0, y); ctx.lineTo(plot.x0 + plot.width, y);
    }
    ctx.stroke();

    for (const s of this.series) {
      const pts = seriesPoints(s.data, plot);
      if (!pts.length) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }

    // Footer: the span of simulated time on screen.
    ctx.fillStyle = 'rgba(160,172,200,0.75)';
    const n = this.times.length;
    if (n > 1) {
      const span = this.times[n - 1] - this.times[0];
      const label = `← last ${fmtNum(span)} ${this.timeUnit} · each line scaled to its own range`;
      ctx.fillText(label, plot.x0, h - 3);
    } else {
      ctx.fillText('Recording… (statistics are charted while the simulation runs)', plot.x0, h - 3);
    }
  }
}
