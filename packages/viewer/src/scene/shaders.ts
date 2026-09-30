/**
 * GLSL for the tree. Colors are linear and may exceed 1: the bloom pass turns
 * those HDR values into glow, and the tone mapping pass brings them back.
 */

/** Gentle wind: the higher and farther from the trunk, the more it moves. */
const WIND = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform float uHeight;

vec3 windOffset(vec3 p) {
  float h = clamp(p.y / uHeight, 0.0, 1.4);
  float r = length(p.xz) / uHeight;
  float bend = (h * h * 0.5 + r * r * 1.6) * uWind * uHeight * 0.014;
  float wx = sin(uTime * 0.8 + p.y * 0.06 + p.x * 0.04) * 0.7 + sin(uTime * 2.1 + p.z * 0.13) * 0.3;
  float wz = cos(uTime * 0.65 + p.y * 0.05 + p.z * 0.04) * 0.6 + sin(uTime * 1.6 + p.x * 0.1) * 0.25;
  return vec3(wx, 0.0, wz) * bend;
}
`;

export const woodVertex = /* glsl */ `
${WIND}
uniform float uProgress;
attribute vec3 aCenter;
attribute float aBirth;
attribute float aKind;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
varying float vKind;
varying float vFresh;

void main() {
  // Unborn wood collapses onto its axis, so branches extend as history is replayed.
  float grown = smoothstep(aBirth - 0.012, aBirth, uProgress);
  vec3 local = mix(aCenter, position, grown);
  vec4 world = modelMatrix * vec4(local, 1.0);
  world.xyz += windOffset((modelMatrix * vec4(aCenter, 1.0)).xyz);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vKind = aKind;
  vFresh = grown * (1.0 - smoothstep(aBirth, aBirth + 0.025, uProgress));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const woodFragment = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform vec3 uBarkLow;
uniform vec3 uBarkHigh;
uniform vec3 uRim;
uniform vec3 uSap;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
varying float vKind;
varying float vFresh;

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  float facing = clamp(dot(n, v), 0.0, 1.0);
  float rim = pow(1.0 - facing, 3.0);

  vec3 bark = mix(uBarkLow, uBarkHigh, clamp(vWorld.y / uHeight, 0.0, 1.0));
  float groove = sin(vUv.y * 6.2831 * 7.0 + sin(vUv.x * 0.9) * 1.5);
  bark *= 0.78 + 0.22 * groove;

  float key = clamp(dot(n, normalize(vec3(0.35, 0.85, 0.4))), 0.0, 1.0);
  vec3 color = bark * (0.35 + 0.9 * key);
  color += uRim * rim * (vKind > 2.5 ? 0.45 : 1.0);

  // Pulses of light flowing from the roots up to the tips.
  float flow = fract(vUv.x * 0.045 - uTime * 0.16);
  float pulse = smoothstep(0.0, 0.015, flow) * (1.0 - smoothstep(0.015, 0.09, flow));
  color += uSap * pulse * (vKind < 0.5 ? 0.06 + rim * 0.9 : 0.25 + rim * 1.5);
  color += uSap * vFresh * (vKind < 0.5 ? 0.4 : 1.1);

  gl_FragColor = vec4(color, 1.0);
}
`;

/** Shared by leaves and merge buds (buds define BUD). */
export const foliageVertex = /* glsl */ `
${WIND}
uniform float uProgress;
uniform float uHover;
uniform float uSelected;
uniform float uFocusAuthor;
attribute vec3 aColor;
attribute float aBirth;
attribute float aCommit;
attribute float aAuthor;
attribute float aSeed;
varying vec3 vColor;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vFocus;
varying float vHighlight;
varying float vFresh;
varying float vShade;

void main() {
  // Pop in with a small overshoot when the history reaches this commit.
  float t = clamp((uProgress - aBirth) / 0.02, 0.0, 1.0);
  float pop = t >= 1.0 ? 1.0 : 1.0 - pow(1.0 - t, 3.0) + sin(t * 3.14159) * 0.35;

  float hover = 1.0 - step(0.5, abs(aCommit - uHover));
  float selected = 1.0 - step(0.5, abs(aCommit - uSelected));
  float focus = uFocusAuthor < 0.0 ? 1.0 : 1.0 - step(0.5, abs(aAuthor - uFocusAuthor));
  float focusScale = uFocusAuthor < 0.0 ? 1.0 : mix(0.55, 1.3, focus);
  vec3 local = position * pop * focusScale * (1.0 + hover * 0.7 + selected * 0.45);

#ifndef BUD
  // Leaves flutter around their stem.
  local.z += sin(uTime * (1.6 + aSeed) + aSeed * 40.0) * 0.14 * local.y * uWind;
#endif

  mat4 model = modelMatrix * instanceMatrix;
  vec4 world = model * vec4(local, 1.0);
  world.xyz += windOffset((model * vec4(0.0, 0.0, 0.0, 1.0)).xyz);

  vWorld = world.xyz;
  vNormalW = normalize(mat3(model) * normal);
  vColor = aColor;
  vUv = uv;
  vFocus = focus;
  vHighlight = max(hover, selected);
  vFresh = t > 0.0 ? 1.0 - smoothstep(aBirth, aBirth + 0.025, uProgress) : 0.0;
  vShade = 0.7 + 0.55 * fract(aSeed * 7.13);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const foliageFragment = /* glsl */ `
uniform float uGlow;
varying vec3 vColor;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vFocus;
varying float vHighlight;
varying float vFresh;
varying float vShade;

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  if (!gl_FrontFacing) n = -n;
  float facing = clamp(abs(dot(n, v)), 0.0, 1.0);

#ifdef BUD
  float rim = pow(1.0 - facing, 1.6);
  vec3 color = vColor * (0.7 + rim * 2.4) + vec3(0.35) * rim;
#else
  float rim = pow(1.0 - facing, 2.0);
  float across = abs(vUv.x);
  float vein = 1.0 - smoothstep(0.0, 0.09, across);
  float veins = smoothstep(0.8, 1.0, sin((vUv.y * 9.0 - across * 3.0) * 3.14159)) * (1.0 - across) * 0.35;
  float edge = smoothstep(0.62, 1.0, across);
  float key = clamp(dot(n, normalize(vec3(0.35, 0.85, 0.4))), 0.0, 1.0);
  vec3 color = vColor * (0.28 + 0.62 * vUv.y) * (0.6 + 0.4 * key);
  color += vColor * (vein * 0.55 + veins * 0.7 + edge * 0.18 + rim * 0.55);
  // Each leaf gets its own shade, so the foliage of one author is not a flat blob.
  color *= vShade;
#endif

  color *= uGlow;
  color = mix(color * 0.06 + vec3(0.008, 0.008, 0.02), color, vFocus);
  color += vHighlight * vec3(0.95, 0.95, 1.0);
  color += vColor * vFresh * 1.6;
  gl_FragColor = vec4(color, 1.0);
}
`;

export const lianaVertex = /* glsl */ `
${WIND}
uniform float uProgress;
attribute float aAlong;
attribute float aBirth;
varying float vAlong;
varying float vVisible;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.xyz += windOffset(world.xyz);
  vAlong = aAlong;
  vVisible = smoothstep(aBirth, aBirth + 0.03, uProgress);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const lianaFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vAlong;
varying float vVisible;

void main() {
  float spark = pow(0.5 + 0.5 * sin((vAlong * 4.0 - uTime * 0.7) * 6.2831), 10.0);
  float ends = smoothstep(0.0, 0.12, vAlong) * (1.0 - smoothstep(0.88, 1.0, vAlong));
  vec3 color = mix(uColorA, uColorB, vAlong);
  float alpha = uOpacity * vVisible * (0.3 + 1.7 * spark) * (0.35 + 0.65 * ends);
  gl_FragColor = vec4(color * alpha, 1.0);
}
`;

export const groundVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

export const groundFragment = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform vec3 uGlow;
uniform vec3 uLines;
varying vec3 vWorld;

void main() {
  float d = length(vWorld.xz) / uRadius;
  if (d > 1.0) discard;
  float glow = exp(-d * d * 10.0);
  float rings = d * 16.0 - uTime * 0.12;
  float line = 1.0 - min(abs(fract(rings - 0.5) - 0.5) / fwidth(rings), 1.0);
  float fade = 1.0 - smoothstep(0.25, 1.0, d);
  vec3 color = uGlow * glow * 0.55 + uLines * line * fade * 0.22;
  gl_FragColor = vec4(color, 1.0);
}
`;

export const backdropVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const backdropFragment = /* glsl */ `
uniform float uTime;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 color = mix(vec3(0.003, 0.003, 0.01), vec3(0.012, 0.01, 0.034), smoothstep(-0.3, 0.7, d.y));
  float clouds = fbm(d * 2.2 + vec3(uTime * 0.004, 0.0, 0.0));
  float detail = fbm(d * 5.5 + 7.3);
  float nebula = smoothstep(0.47, 0.85, clouds) * (0.55 + 0.45 * detail);
  vec3 tint = mix(vec3(0.2, 0.08, 0.45), vec3(0.02, 0.22, 0.35), smoothstep(0.3, 0.7, detail));
  color += tint * nebula * 0.24;
  // A faint band across the sky, like a galactic plane.
  float band = exp(-pow(d.y * 3.2 - 0.15 + (detail - 0.5) * 0.6, 2.0));
  color += vec3(0.08, 0.05, 0.16) * band * 0.35 * (0.6 + clouds);
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Same wind as the shaders, to keep HTML markers glued to their swaying leaf. */
export function windOffset(x: number, y: number, z: number, time: number, strength: number, height: number) {
  const h = Math.min(Math.max(y / height, 0), 1.4);
  const r = Math.hypot(x, z) / height;
  const bend = (h * h * 0.5 + r * r * 1.6) * strength * height * 0.014;
  const wx = Math.sin(time * 0.8 + y * 0.06 + x * 0.04) * 0.7 + Math.sin(time * 2.1 + z * 0.13) * 0.3;
  const wz = Math.cos(time * 0.65 + y * 0.05 + z * 0.04) * 0.6 + Math.sin(time * 1.6 + x * 0.1) * 0.25;
  return [wx * bend, 0, wz * bend] as const;
}
