// Uniform grid for fast neighbour queries among many moving points.
export class SpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  key(cx, cy) {
    // Pack two signed 16-bit cell coordinates into one integer key.
    return ((cx + 32768) << 16) | (cy + 32768);
  }

  clear() {
    this.cells.clear();
  }

  insert(item, x, y) {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    let bucket = this.cells.get(k);
    if (!bucket) this.cells.set(k, (bucket = []));
    bucket.push(item);
  }

  rebuild(items, getX = (o) => o.x, getY = (o) => o.y) {
    this.clear();
    for (const it of items) this.insert(it, getX(it), getY(it));
  }

  // Calls fn(item) for every item in cells overlapping the radius around (x, y).
  query(x, y, radius, fn) {
    const s = this.cellSize;
    const x0 = Math.floor((x - radius) / s), x1 = Math.floor((x + radius) / s);
    const y0 = Math.floor((y - radius) / s), y1 = Math.floor((y + radius) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
      }
    }
  }
}
