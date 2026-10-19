// Procedural meshes as plain typed arrays (no GL here, so they can be tested in
// Node). Every mesh is { positions, normals, uvs, indices } with unit size.

/**
 * UV sphere of radius 1 with +y through the poles. u runs with longitude
 * (0 at -x… wrapping), v runs from the north pole (0) to the south pole (1).
 */
export function sphere(rows = 24, cols = 48) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows, lat = Math.PI / 2 - v * Math.PI;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols, lon = u * Math.PI * 2 - Math.PI;
      // Longitude 0 on +x, increasing towards -z (east), matching tangentBasis().
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = -Math.cos(lat) * Math.sin(lon);
      positions.push(x, y, z);
      normals.push(x, y, z);
      uvs.push(u, v);
    }
  }
  const w = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * w + c, b = a + w;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return pack(positions, normals, uvs, indices);
}

/** Unit quad in the x–z plane facing +y, from (-0.5, 0, -0.5) to (0.5, 0, 0.5); v grows with +z. */
export function quad() {
  return pack(
    [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [0, 0, 1, 0, 1, 1, 0, 1],
    [0, 2, 1, 0, 3, 2],
  );
}

/** Unit cube centred on the origin (edge 1) with flat normals. */
export function box() {
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const positions = [], normals = [], uvs = [], indices = [];
  for (const [n, u, v] of faces) {
    const base = positions.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      positions.push(n[0] / 2 + (u[0] * a) / 2 + (v[0] * b) / 2, n[1] / 2 + (u[1] * a) / 2 + (v[1] * b) / 2, n[2] / 2 + (u[2] * a) / 2 + (v[2] * b) / 2);
      normals.push(...n);
      uvs.push((a + 1) / 2, (1 - b) / 2);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return pack(positions, normals, uvs, indices);
}

/** Flat disc of radius 1 in the x–z plane facing +y. */
export function disc(segments = 64) {
  const positions = [0, 0, 0], normals = [0, 1, 0], uvs = [0.5, 0.5], indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a), 0, -Math.sin(a));
    normals.push(0, 1, 0);
    uvs.push(0.5 + Math.cos(a) / 2, 0.5 - Math.sin(a) / 2);
    if (i > 0) indices.push(0, i, i + 1);
  }
  return pack(positions, normals, uvs, indices);
}

/** Closed polyline (x, y, z triples) of a unit circle in the plane spanned by a and b. */
export function circlePoints(center, a, b, radius, segments = 48) {
  const out = new Float64Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2, c = Math.cos(t) * radius, s = Math.sin(t) * radius;
    for (let k = 0; k < 3; k++) out[i * 3 + k] = center[k] + a[k] * c + b[k] * s;
  }
  return out;
}

function pack(positions, normals, uvs, indices) {
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint16Array.from(indices),
  };
}
