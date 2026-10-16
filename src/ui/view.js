// 2D camera mapping world coordinates to CSS pixels on the canvas.
export class View {
  constructor() {
    this.cx = 0;
    this.cy = 0;
    this.scale = 1; // pixels per world unit
    this.width = 1;
    this.height = 1;
    this.yUp = false;
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
  }

  fit({ x, y, w, h }, margin = 0.06) {
    this.cx = x + w / 2;
    this.cy = y + h / 2;
    this.scale = Math.min(this.width / w, this.height / h) * (1 - margin * 2);
  }

  toScreen(x, y) {
    const sy = this.yUp ? this.height / 2 - (y - this.cy) * this.scale : this.height / 2 + (y - this.cy) * this.scale;
    return [this.width / 2 + (x - this.cx) * this.scale, sy];
  }

  toWorld(sx, sy) {
    const y = this.yUp ? this.cy - (sy - this.height / 2) / this.scale : this.cy + (sy - this.height / 2) / this.scale;
    return [this.cx + (sx - this.width / 2) / this.scale, y];
  }

  /** Convert a screen-space displacement to world-space. */
  deltaToWorld(dx, dy) {
    return [dx / this.scale, (this.yUp ? -dy : dy) / this.scale];
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale *= factor;
    const [nx, ny] = this.toWorld(sx, sy);
    this.cx += wx - nx;
    this.cy += wy - ny;
  }

  pan(dx, dy) {
    const [wx, wy] = this.deltaToWorld(dx, dy);
    this.cx -= wx;
    this.cy -= wy;
  }
}
