const PALETTE = ['#6aa8ff', '#ff6a5c', '#5ed37a', '#ffc94a', '#c58cff', '#4ad8d8'];

// Minimal multi-series time chart drawn on a canvas.
export class Chart {
  constructor(canvas, maxPoints = 400) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maxPoints = maxPoints;
    this.reset([]);
  }

  reset(series) {
    this.series = series.map((s, i) => ({ ...s, color: s.color ?? PALETTE[i % PALETTE.length], data: [] }));
  }

  push(values) {
    for (const s of this.series) {
      const v = values[s.key];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      s.data.push(v);
      if (s.data.length > this.maxPoints) s.data.shift();
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
    const pad = 4, legendH = 14;
    ctx.font = '10px system-ui, sans-serif';
    let lx = pad;
    for (const s of this.series) {
      ctx.fillStyle = s.color;
      const last = s.data.length ? s.data[s.data.length - 1] : NaN;
      const text = `${s.label}: ${Number.isFinite(last) ? +last.toPrecision(4) : '—'}`;
      ctx.fillText(text, lx, 10);
      lx += ctx.measureText(text).width + 12;
    }
    // Each series is normalised to its own range so different units can share the plot.
    for (const s of this.series) {
      if (s.data.length < 2) continue;
      let lo = Math.min(...s.data), hi = Math.max(...s.data);
      if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      s.data.forEach((v, i) => {
        const x = pad + (i / (this.maxPoints - 1)) * (w - pad * 2);
        const y = legendH + pad + (1 - (v - lo) / (hi - lo)) * (h - legendH - pad * 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
}
