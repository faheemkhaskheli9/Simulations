// The world renderer: a deliberately small facade over WebGL2 (ADR-006). Callers
// draw in layers, one per place, each with its own near/far planes and a depth
// clear, and pass positions already relative to the camera, so float32 on the
// GPU only ever sees small numbers.
import { mat4 } from './math3d.js';
import { MESH, SPHERES, POINTS, LINES } from './materials.js';
import { createProgram, staticBuffer, dynamicBuffer, attrib, uploadTexture } from './gl.js';
import { sphere, quad, box, disc } from './meshes.js';
import { FOVY } from './camera3d.js';

export { hexColor } from './colors.js';

const MESHES = { sphere: () => sphere(32, 64), quad, box, disc };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.lost = false;
    this.drawCalls = 0;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.init();
      this.lost = false;
    });
    this.init();
  }

  /** Create every GPU resource from its CPU description (also used after context loss). */
  init() {
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.textures = new Map();
    this.programs = {
      mesh: createProgram(gl, MESH, ['aPos', 'aNormal', 'aUv']),
      spheres: createProgram(gl, SPHERES, ['aPos', 'aNormal', 'aInst', 'aColor']),
      points: createProgram(gl, POINTS, ['aPoint', 'aColor']),
      lines: createProgram(gl, LINES, ['aPos']),
    };
    this.instances = dynamicBuffer(gl);
    this.pointBuf = dynamicBuffer(gl);
    this.lineBuf = dynamicBuffer(gl);
    this.meshes = {};
    for (const [name, make] of Object.entries(MESHES)) {
      const m = make();
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const pos = staticBuffer(gl, gl.ARRAY_BUFFER, m.positions);
      const nrm = staticBuffer(gl, gl.ARRAY_BUFFER, m.normals);
      attrib(gl, pos, 0, 3);
      attrib(gl, nrm, 1, 3);
      attrib(gl, staticBuffer(gl, gl.ARRAY_BUFFER, m.uvs), 2, 2);
      staticBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, m.indices);
      this.meshes[name] = { vao, count: m.indices.length, pos, nrm, indices: m.indices };
    }
    // Instanced spheres reuse the sphere's vertex buffers with per-instance data.
    const s = this.meshes.sphere;
    this.sphereVao = gl.createVertexArray();
    gl.bindVertexArray(this.sphereVao);
    attrib(gl, s.pos, 0, 3);
    attrib(gl, s.nrm, 1, 3);
    attrib(gl, this.instances.buffer, 2, 4, 32, 0, 1);
    attrib(gl, this.instances.buffer, 3, 4, 32, 16, 1);
    staticBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, s.indices);
    this.pointVao = gl.createVertexArray();
    gl.bindVertexArray(this.pointVao);
    attrib(gl, this.pointBuf.buffer, 0, 4, 32, 0);
    attrib(gl, this.pointBuf.buffer, 1, 4, 32, 16);
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    attrib(gl, this.lineBuf.buffer, 0, 3);
    gl.bindVertexArray(null);
  }

  resize(cssWidth, cssHeight, dpr) {
    this.dpr = dpr;
    this.width = Math.max(1, cssWidth);
    this.height = Math.max(1, cssHeight);
    const w = Math.round(this.width * dpr), h = Math.round(this.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  begin(sky) {
    const gl = this.gl;
    this.drawCalls = 0;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /**
   * Start a layer: clear depth, set the projection for [near, far] and the
   * camera rotation (a mat4 from mat4.lookDir) and light direction for this layer.
   */
  layer(view, near, far, light = [0.35, 0.85, 0.4]) {
    const gl = this.gl;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    this.proj = mat4.f32(mat4.perspective(FOVY, this.width / this.height, near, far));
    this.view = mat4.f32(view);
    const l = Math.hypot(...light) || 1;
    this.light = [light[0] / l, light[1] / l, light[2] / l];
  }

  use(name) {
    const p = this.programs[name];
    const gl = this.gl;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
    gl.uniformMatrix4fv(p.u.uView, false, this.view);
    if (p.u.uLight) gl.uniform3fv(p.u.uLight, this.light);
    return p;
  }

  /**
   * Draw a mesh ('sphere', 'quad', 'box', 'disc') with a camera-relative model
   * matrix. opts: { color, texture (key), lit (0…1), night (0…1), depthWrite, cull }.
   */
  mesh(name, model, opts = {}) {
    const gl = this.gl, m = this.meshes[name];
    const p = this.use('mesh');
    gl.uniformMatrix4fv(p.u.uModel, false, mat4.f32(model));
    gl.uniform4fv(p.u.uColor, opts.color ?? [1, 1, 1, 1]);
    gl.uniform1f(p.u.uLit, opts.lit ?? 1);
    gl.uniform1f(p.u.uNight, opts.night ?? 0.3);
    const tex = opts.texture && this.textures.get(opts.texture);
    gl.uniform1i(p.u.uUseTex, tex ? 1 : 0);
    if (tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex.tex);
      gl.uniform1i(p.u.uTex, 0);
    }
    gl.depthMask(opts.depthWrite ?? true);
    if (opts.cull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    this.drawCalls++;
  }

  /** Instanced spheres; data holds 8 floats per sphere: x, y, z, radius, r, g, b, glow. */
  spheres(data, count = data.length / 8) {
    if (!count) return;
    const gl = this.gl;
    this.use('spheres');
    this.instances.upload(data.subarray(0, count * 8));
    gl.bindVertexArray(this.sphereVao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.meshes.sphere.count, gl.UNSIGNED_SHORT, 0, count);
    this.drawCalls++;
  }

  /** Round points; data holds 8 floats per point: x, y, z, size px, r, g, b, a. */
  points(data, count = data.length / 8, additive = false) {
    if (!count) return;
    const gl = this.gl;
    const p = this.use('points');
    gl.uniform1f(p.u.uDpr, this.dpr);
    this.pointBuf.upload(data.subarray(0, count * 8));
    gl.depthMask(false);
    if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindVertexArray(this.pointVao);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    this.drawCalls++;
  }

  /** 1 px lines through camera-relative positions (x, y, z triples). */
  lines(positions, color, strip = true, depthTest = true) {
    const n = positions.length / 3;
    if (n < 2) return;
    const gl = this.gl;
    const p = this.use('lines');
    gl.uniform4fv(p.u.uColor, color);
    this.lineBuf.upload(positions instanceof Float32Array ? positions : Float32Array.from(positions));
    if (!depthTest) gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.lineVao);
    gl.drawArrays(strip ? gl.LINE_STRIP : gl.LINES, 0, n);
    gl.enable(gl.DEPTH_TEST);
    this.drawCalls++;
  }

  /**
   * Upload a texture from a canvas (or RGBA bytes with width/height) under `key`
   * when `version` changed or the texture is missing (e.g. after context loss).
   */
  texture(key, source, version, width, height, smooth = true) {
    let t = this.textures.get(key);
    if (t && t.version === version) return key;
    if (!t) {
      t = { tex: this.gl.createTexture(), version: null };
      this.textures.set(key, t);
    }
    uploadTexture(this.gl, t.tex, source, width, height, smooth);
    t.version = version;
    return key;
  }

  hasTexture(key) {
    return this.textures.has(key);
  }

  dropTexture(key) {
    const t = this.textures.get(key);
    if (t) this.gl.deleteTexture(t.tex);
    this.textures.delete(key);
  }
}
