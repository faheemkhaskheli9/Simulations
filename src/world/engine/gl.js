// Thin WebGL2 helpers. All GL calls of the world live in src/world/engine/ (W-TC-2).

/** True when the browser can create a WebGL2 context. */
export function webgl2Available() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

function compile(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return s;
}

/**
 * Link a program from { vertex, fragment } with fixed attribute locations
 * (so one VAO layout serves several programs). Returns { program, u: uniforms }.
 */
export function createProgram(gl, { vertex, fragment }, attributes) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragment));
  attributes.forEach((name, i) => gl.bindAttribLocation(p, i, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) ?? 0;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { program: p, u };
}

/** Static buffer with data. */
export function staticBuffer(gl, target, data) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return b;
}

/** Growable dynamic buffer: upload(data, count) re-allocates only when it must grow. */
export function dynamicBuffer(gl) {
  const buffer = gl.createBuffer();
  let capacity = 0;
  return {
    buffer,
    upload(data) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (data.byteLength > capacity) {
        capacity = Math.max(data.byteLength, capacity * 2, 1024);
        gl.bufferData(gl.ARRAY_BUFFER, capacity, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    },
  };
}

/** Bind float attribute `loc` of `size` components from `buffer`. */
export function attrib(gl, buffer, loc, size, stride = 0, offset = 0, divisor = 0) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  gl.vertexAttribDivisor(loc, divisor);
}

/** Create or update a texture from a canvas/image or from RGBA bytes. */
export function uploadTexture(gl, tex, source, width, height, smooth = true) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (source instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  const f = smooth ? gl.LINEAR : gl.NEAREST;
  // Mipmaps keep a big module picture from shimmering when seen small or at a slant.
  if (smooth) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, smooth ? gl.LINEAR_MIPMAP_LINEAR : f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
