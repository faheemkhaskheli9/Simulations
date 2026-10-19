// GLSL sources for the world renderer. They are static strings: no shader text
// is ever built from user or file data (W-SP-2). Every position arrives already
// relative to the camera (floating origin), so uView holds only a rotation.

const HEADER = '#version 300 es\nprecision highp float;\n';

/** Meshes (planes, boxes, globes, ground): optional texture, optional lighting. */
export const MESH = {
  vertex: `${HEADER}
in vec3 aPos; in vec3 aNormal; in vec2 aUv;
uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel;
out vec3 vNormal; out vec2 vUv;
void main() {
  vNormal = normalize(mat3(uModel) * aNormal);
  vUv = aUv;
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}`,
  fragment: `${HEADER}
in vec3 vNormal; in vec2 vUv;
uniform vec4 uColor; uniform sampler2D uTex; uniform bool uUseTex;
uniform vec3 uLight; uniform float uLit; uniform float uNight;
out vec4 outColor;
void main() {
  vec4 base = uColor;
  if (uUseTex) base *= texture(uTex, vUv);
  float d = dot(normalize(vNormal), uLight);
  // Lambert with a soft terminator; uNight sets how dark the unlit side gets.
  float light = mix(uNight, 1.0, smoothstep(-0.08, 0.25, d));
  outColor = vec4(base.rgb * mix(1.0, light, uLit), base.a);
}`,
};

/** Instanced spheres: per instance [x, y, z, radius] and [r, g, b, glow]. */
export const SPHERES = {
  vertex: `${HEADER}
in vec3 aPos; in vec3 aNormal; in vec4 aInst; in vec4 aColor;
uniform mat4 uProj; uniform mat4 uView;
out vec3 vNormal; out vec4 vColor;
void main() {
  vNormal = aNormal;
  vColor = aColor;
  gl_Position = uProj * uView * vec4(aInst.xyz + aPos * aInst.w, 1.0);
}`,
  fragment: `${HEADER}
in vec3 vNormal; in vec4 vColor;
uniform vec3 uLight;
out vec4 outColor;
void main() {
  float d = max(dot(normalize(vNormal), uLight), 0.0);
  float light = mix(0.25 + 0.75 * d, 1.0, vColor.a);
  outColor = vec4(vColor.rgb * light, 1.0);
}`,
};

/** Round sprites of a fixed pixel size: per point [x, y, z, sizePx] and [r, g, b, a]. */
export const POINTS = {
  vertex: `${HEADER}
in vec4 aPoint; in vec4 aColor;
uniform mat4 uProj; uniform mat4 uView; uniform float uDpr;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = uProj * uView * vec4(aPoint.xyz, 1.0);
  gl_PointSize = max(1.0, aPoint.w * uDpr);
}`,
  fragment: `${HEADER}
in vec4 vColor;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  outColor = vec4(vColor.rgb, vColor.a * (1.0 - r * r));
}`,
};

/** 1 px lines (review R10): positions only, one colour per draw. */
export const LINES = {
  vertex: `${HEADER}
in vec3 aPos;
uniform mat4 uProj; uniform mat4 uView;
void main() { gl_Position = uProj * uView * vec4(aPos, 1.0); }`,
  fragment: `${HEADER}
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }`,
};
