// Small 3D maths library. Vectors are plain [x, y, z] arrays; matrices are
// column-major Float64Array(16) (the WebGL layout) and converted to float32 only
// when uploaded, after the camera position has been subtracted.

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm(a) {
    const l = Math.hypot(a[0], a[1], a[2]);
    return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  finite: (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite),
};

/** Rotate vector v around unit axis k by angle a (Rodrigues). */
export function rotateAxis(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = v3.cross(k, v), d = v3.dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}

/** 3×3 basis as three column vectors [ex, ey, ez]. */
export const IDENTITY_BASIS = Object.freeze([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);

/** basis · v (local → parent orientation). */
export const basisApply = (B, v) => [
  B[0][0] * v[0] + B[1][0] * v[1] + B[2][0] * v[2],
  B[0][1] * v[0] + B[1][1] * v[1] + B[2][1] * v[2],
  B[0][2] * v[0] + B[1][2] * v[1] + B[2][2] * v[2],
];

/** basisᵀ · v (parent → local orientation; the basis is orthonormal). */
export const basisApplyT = (B, v) => [v3.dot(B[0], v), v3.dot(B[1], v), v3.dot(B[2], v)];

/**
 * Basis for a patch tangent to a sphere at latitude/longitude (degrees):
 * local +y points away from the centre (up), +x east, +z south. The sphere's own
 * frame has +y through the north pole and longitude 0 on +x.
 */
export function tangentBasis(latDeg, lonDeg) {
  const la = (latDeg * Math.PI) / 180, lo = (lonDeg * Math.PI) / 180;
  const up = [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
  const east = v3.norm([-Math.sin(lo), 0, -Math.cos(lo)]);
  const south = v3.cross(east, up);
  return [east, up, south];
}

export const sphericalToCartesian = (latDeg, lonDeg, r) => v3.scale(tangentBasis(latDeg, lonDeg)[1], r);

export const mat4 = {
  identity() {
    const m = new Float64Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },

  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    const m = new Float64Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) * nf;
    m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
  },

  /** View rotation for a camera at the origin looking along `dir` with `up`. */
  lookDir(dir, up) {
    const z = v3.norm(v3.scale(dir, -1));
    let x = v3.cross(up, z);
    if (v3.len(x) < 1e-9) x = v3.cross([0, 0, 1], z);
    x = v3.norm(x);
    const y = v3.cross(z, x);
    const m = new Float64Array(16);
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[15] = 1;
    return m;
  },

  multiply(a, b) {
    const o = new Float64Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },

  /** Transform a point (w = 1); returns [x, y, z, w]. */
  transform(m, p) {
    const [x, y, z] = p;
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
      m[3] * x + m[7] * y + m[11] * z + m[15],
    ];
  },

  f32: (m) => Float32Array.from(m),
};
