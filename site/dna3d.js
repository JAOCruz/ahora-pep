/* =====================================================================
   AhoraPep — dna3d.js
   A bioluminescent DNA double helix made of glowing particles that
   assembles from a cloud, spins/zooms, unravels into strands and
   re-forms behind the following sections. Three.js r169 (importmap),
   scrubbed by GSAP ScrollTrigger (Lenis-smoothed), palette morphing
   blue → orange → pink. Fixed full-viewport stage; degrades to the
   brand video/image when WebGL or the module fails.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const html = document.documentElement;
const stage = document.getElementById('dna-stage');
const hero = document.getElementById('hero');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const mobile = innerWidth < 820 || !fine;
const hasGsap = !!(window.gsap && window.ScrollTrigger);
const motion = hasGsap && !reduced;

/* ---------- Brand palette: [strand A, strand B, rungs] per phase ---------- */
const PAL = [
  ['#3d8bff', '#7dd3fc', '#dbeeff'],   // Recuperación — electric blue
  ['#ff7a1a', '#ffb347', '#ffe3c2'],   // Energía — warm orange
  ['#ff2d95', '#ff7ad9', '#ffd1f0'],   // Longevidad — hot pink
].map(p => p.map(c => new THREE.Color(c)));

/* ---------- Scroll keyframes (P: 0..1 hero pin, 1..2 rest of page) ---------- */
const OX = mobile ? 0 : 1;               // helix sits right of the title on desktop
const KF = [
  { p: 0.00, asm: 0.00, un: 0, cz: 15.5, ox: OX * 1.2, oy: 0.2, tilt: -0.55, spin: 0.0, op: 0.95, pal: 0.0, glow: 0.7 },
  { p: 0.30, asm: 1.00, un: 0, cz: 11.0, ox: OX * 1.0, oy: 0.0, tilt: -0.50, spin: 1.2, op: 1.00, pal: 0.0, glow: 0.9 },
  { p: 0.56, asm: 1.00, un: 0, cz: 6.6, ox: 0.0, oy: 0.0, tilt: -0.32, spin: 2.6, op: 1.00, pal: 1.0, glow: 1.1 },
  { p: 0.80, asm: 1.00, un: 1, cz: 10.5, ox: 0.0, oy: 0.0, tilt: -0.18, spin: 3.6, op: 0.95, pal: 2.0, glow: 1.0 },
  { p: 1.00, asm: 0.12, un: 1, cz: 14.0, ox: 0.0, oy: 0.4, tilt: 0.00, spin: 4.1, op: 0.55, pal: 2.0, glow: 0.55 },
  { p: 1.16, asm: 1.00, un: 0, cz: 14.0, ox: OX * 4.4, oy: -0.8, tilt: -0.62, spin: 4.8, op: 0.38, pal: 0.0, glow: 0.45 },
  { p: 1.46, asm: 1.00, un: 0, cz: 12.0, ox: OX * -4.0, oy: 0.0, tilt: -0.40, spin: 6.2, op: 0.45, pal: 0.6, glow: 0.5 },
  { p: 1.72, asm: 1.00, un: 0.45, cz: 12.5, ox: OX * 3.6, oy: 0.0, tilt: -0.52, spin: 7.6, op: 0.40, pal: 1.2, glow: 0.5 },
  { p: 2.00, asm: 0.55, un: 1, cz: 14.5, ox: 0.0, oy: 0.0, tilt: -0.30, spin: 8.8, op: 0.35, pal: 2.0, glow: 0.45 },
];
const FIELDS = Object.keys(KF[0]).filter(k => k !== 'p');
const sm = t => t * t * (3 - 2 * t);
function stateAt(P, out) {
  P = Math.max(0, Math.min(2, P));
  let i = 0; while (i < KF.length - 2 && P > KF[i + 1].p) i++;
  const a = KF[i], b = KF[i + 1], t = sm(Math.max(0, Math.min(1, (P - a.p) / (b.p - a.p))));
  FIELDS.forEach(k => (out[k] = a[k] + (b[k] - a[k]) * t));
  return out;
}

/* ---------- Shaders ---------- */
const VERT = /* glsl */`
uniform float uTime, uAssemble, uUnravel, uSpin, uTilt, uPr, uFocus, uCoC, uSize, uOpacity, uBreath;
uniform vec3 uColA, uColB, uColR; uniform vec2 uOff;
attribute vec3 aHelix, aFlat, aCloud; attribute vec4 aSeed;
varying vec4 vCol;
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
void main(){
  float kind = aSeed.z, rnd = aSeed.x;
  vec3 p;
  float asm = 0.0;
  if (kind > 2.5) {
    // ambient plankton: slow drift, never assembles
    p = aHelix + 0.6 * vec3(sin(uTime * 0.21 + rnd * 6.283), cos(uTime * 0.17 + rnd * 4.1), sin(uTime * 0.13 + rnd * 2.7));
  } else {
    vec3 h = mix(aHelix, aFlat, uUnravel);
    vec3 local = rotZ(uTilt) * rotY(uSpin * (1.0 - 0.55 * uUnravel)) * h;
    local += 0.06 * uBreath * vec3(sin(uTime * 0.9 + rnd * 6.283), cos(uTime * 0.7 + rnd * 3.1), sin(uTime * 0.8 + rnd * 9.4));
    vec3 cloud = aCloud + 0.45 * vec3(sin(uTime * 0.25 + rnd * 6.283), cos(uTime * 0.2 + rnd * 4.0), sin(uTime * 0.3 + rnd * 2.0));
    float lag = kind > 1.5 ? 0.22 : 0.0;                        // rungs bridge after the strands settle
    asm = smoothstep(0.0, 1.0, clamp((uAssemble - lag) * 1.25 + (rnd - 0.5) * 0.3, 0.0, 1.0));
    p = mix(cloud, local, asm);
  }
  p.xy += uOff;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(-mv.z, 0.5);
  float coc = clamp(abs(d - uFocus) * uCoC, 0.0, 1.0);                 // bokeh: off-focus particles bloom & dim
  float sz = aSeed.y * uSize * uPr * (1.0 + coc * 2.4) * 300.0 / d;
  gl_PointSize = clamp(sz, 1.0, 72.0 * uPr);
  float a = uOpacity * (1.0 - coc * 0.72) * smoothstep(42.0, 14.0, d) * clamp(1.25 / aSeed.y, 0.28, 1.0);
  a *= 0.78 + 0.22 * sin(uTime * 1.7 + rnd * 50.0);
  vec3 col;
  if (kind < 0.5) col = uColA;
  else if (kind < 1.5) col = uColB;
  else if (kind < 2.5) { col = uColR; a *= (1.0 - uUnravel) * (0.35 + 0.65 * asm); }
  else { col = mix(uColA, uColB, rnd); a *= 0.42; }
  if (kind < 2.5) col = mix(mix(uColA, uColB, rnd) * 0.8, col, asm);
  vCol = vec4(col, a);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
varying vec4 vCol;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float g = exp(-r * r * 3.4) * (1.0 - smoothstep(0.8, 1.0, r));
  float core = exp(-r * r * 16.0);
  vec3 c = vCol.rgb * (0.8 + 0.9 * core) + core * 0.32;
  float a = vCol.a * g;
  if (a < 0.003) discard;
  gl_FragColor = vec4(c, a);
}`;
const PETAL_VERT = /* glsl */`
uniform float uTime, uPr, uOpacity; attribute float aSeed; varying float vRot; varying float vA; varying float vMix;
void main(){
  vec3 p = position;
  p.y = mod(position.y + uTime * (0.10 + 0.12 * aSeed) + 7.0, 14.0) - 7.0;
  p.x += sin(uTime * 0.45 + aSeed * 6.283) * 0.6;
  p.z += cos(uTime * 0.3 + aSeed * 4.0) * 0.3;
  vRot = uTime * (0.25 + 0.5 * aSeed) + aSeed * 6.283;
  vMix = fract(aSeed * 13.7);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(-mv.z, 0.5);
  gl_PointSize = clamp((2.6 + 2.4 * fract(aSeed * 7.3)) * uPr * 300.0 / d, 2.0, 90.0 * uPr);
  vA = uOpacity * smoothstep(30.0, 10.0, d) * (0.5 + 0.5 * sin(uTime * 0.6 + aSeed * 20.0));
  gl_Position = projectionMatrix * mv;
}`;
const PETAL_FRAG = /* glsl */`
uniform sampler2D uTex; varying float vRot; varying float vA; varying float vMix;
void main(){
  vec2 uv = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
  float m = texture2D(uTex, uv).a;
  vec3 col = mix(vec3(1.0, 0.72, 0.86), vec3(0.62, 0.95, 0.72), step(0.5, vMix));
  if (m * vA < 0.004) discard;
  gl_FragColor = vec4(col, m * vA);
}`;
const BG_FRAG = /* glsl */`
uniform float uTime, uGlow; uniform vec2 uRes; uniform vec3 uC1, uC2;
float blob(vec2 uv, vec2 c, float r, float asp){ vec2 d = (uv - c) * vec2(asp, 1.0); return exp(-dot(d, d) / (r * r)); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes; float asp = uRes.x / uRes.y; float t = uTime * 0.05;
  vec3 c = vec3(0.016, 0.022, 0.05);
  c += uC1 * 0.22 * uGlow * blob(uv, vec2(0.62 + 0.08 * sin(t * 1.3), 0.55 + 0.07 * cos(t)), 0.5, asp);
  c += uC2 * 0.16 * uGlow * blob(uv, vec2(0.25 + 0.09 * cos(t * 0.8), 0.25 + 0.08 * sin(t * 1.1)), 0.42, asp);
  c *= 1.0 - 0.45 * length((uv - 0.5) * vec2(1.0, 1.4));
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
  gl_FragColor = vec4(c, 1.0);
}`;

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- Geometry ---------- */
function buildHelix() {
  const rng = mulberry(42);
  const nS = mobile ? 1500 : 2800, nR = mobile ? 46 : 72, mR = mobile ? 9 : 14, nA = mobile ? 500 : 1100;
  const H = 10, R = 1.45, TURNS = 2.6, TAU = Math.PI * 2;
  const N = nS * 2 + nR * mR + nA;
  const helix = new Float32Array(N * 3), flat = new Float32Array(N * 3), cloud = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  let i = 0;
  const put = (h, f, c, s) => { helix.set(h, i * 3); flat.set(f, i * 3); cloud.set(c, i * 3); seed.set(s, i * 4); i++; };
  const cloudPt = () => { const u = rng() * 2 - 1, ph = rng() * TAU, r = 3 + rng() * 8; const q = Math.sqrt(1 - u * u); return [Math.cos(ph) * q * r * 1.5, u * r * 0.9, Math.sin(ph) * q * r * 0.7 - 1]; };
  const strandPt = (t, s) => { const a = t * TURNS * TAU + s * Math.PI; return [Math.cos(a) * R, (t - 0.5) * H, Math.sin(a) * R]; };
  const flatPt = (t, s) => { const a = t * TURNS * TAU + s * Math.PI; const side = s ? 1 : -1; return [side * 2.6 + Math.sin(a) * 0.45, (t - 0.5) * H * 1.08, Math.cos(a) * 0.25]; };
  for (let s = 0; s < 2; s++) for (let k = 0; k < nS; k++) {
    const t = (k + rng()) / nS, halo = rng() < 0.22;
    const h = strandPt(t, s), f = flatPt(t, s), j = halo ? 0.55 : 0.1;
    for (let d = 0; d < 3; d++) { const o = (rng() - 0.5) * j; h[d] += o; f[d] += o * 1.6; }
    put(h, f, cloudPt(), [rng(), halo ? 1.6 + rng() * 1.2 : 0.65 + rng() * 0.5, s, t]);
  }
  for (let r = 0; r < nR; r++) {
    const t = (r + 0.5) / nR, A = strandPt(t, 0), B = strandPt(t, 1), fa = flatPt(t, 0), fb = flatPt(t, 1);
    for (let m = 0; m < mR; m++) {
      const u = (m + 0.5) / mR, h = A.map((v, d) => v + (B[d] - v) * u + (rng() - 0.5) * 0.06), f = fa.map((v, d) => v + (fb[d] - v) * u + (rng() - 0.5) * 0.8);
      put(h, f, cloudPt(), [rng(), 0.55 + rng() * 0.4, 2, t]);
    }
  }
  for (let k = 0; k < nA; k++) { const p = [(rng() - 0.5) * 22, (rng() - 0.5) * 14, (rng() - 0.5) * 8 - 2]; put(p, p, p, [rng(), 0.7 + rng() * 1.6, 3, 0]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(helix, 3));
  g.setAttribute('aHelix', new THREE.BufferAttribute(helix, 3));
  g.setAttribute('aFlat', new THREE.BufferAttribute(flat, 3));
  g.setAttribute('aCloud', new THREE.BufferAttribute(cloud, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  return g;
}
function petalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 30, 4, 32, 32, 30); grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.75, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd; x.beginPath(); x.ellipse(32, 32, 12, 28, 0, 0, Math.PI * 2); x.fill();
  x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.ellipse(32, 32, 1.2, 22, 0, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- Main ---------- */
function main() {
  if (!stage || !hero) return;
  if (!window.WebGL2RenderingContext) throw new Error('no webgl2');
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
  if (!renderer.getContext()) throw new Error('no context');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.75));
  renderer.setClearColor(0x04060d, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  stage.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 50 : 40, 1, 0.1, 80);
  const clock = new THREE.Clock();

  // background glow
  const bgU = { uTime: { value: 0 }, uGlow: { value: 0.7 }, uRes: { value: new THREE.Vector2(1, 1) }, uC1: { value: PAL[0][0].clone() }, uC2: { value: PAL[0][1].clone() } };
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: bgU, depthWrite: false, depthTest: false, vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.9999, 1.0); }', fragmentShader: BG_FRAG }));
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);

  // helix particles
  const U = {
    uTime: { value: 0 }, uAssemble: { value: 0 }, uUnravel: { value: 0 }, uSpin: { value: 0 }, uTilt: { value: -0.5 }, uPr: { value: renderer.getPixelRatio() },
    uFocus: { value: 12 }, uCoC: { value: 0.14 }, uSize: { value: mobile ? 0.9 : 1.0 }, uOpacity: { value: 1 }, uBreath: { value: 1 },
    uColA: { value: PAL[0][0].clone() }, uColB: { value: PAL[0][1].clone() }, uColR: { value: PAL[0][2].clone() }, uOff: { value: new THREE.Vector2() },
  };
  const helix = new THREE.Points(buildHelix(), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  helix.frustumCulled = false; scene.add(helix);

  // botanical nod: a few drifting petals / leaves
  const nP = mobile ? 28 : 60, pg = new THREE.BufferGeometry(), pp = new Float32Array(nP * 3), ps = new Float32Array(nP), prng = mulberry(7);
  for (let k = 0; k < nP; k++) { pp.set([(prng() - 0.5) * 20, (prng() - 0.5) * 14, (prng() - 0.5) * 6 - 3], k * 3); ps[k] = prng(); }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aSeed', new THREE.BufferAttribute(ps, 1));
  const PU = { uTime: { value: 0 }, uPr: { value: renderer.getPixelRatio() }, uOpacity: { value: 0.4 }, uTex: { value: petalTexture() } };
  const petals = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: PU, vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending }));
  petals.frustumCulled = false; scene.add(petals);

  // bloom (desktop only; additive particles already glow on mobile)
  let composer = null, bloom = null;
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.7, 0.2);
    composer.addPass(bloom); composer.addPass(new OutputPass());
  }

  /* ---------- State ---------- */
  const S = { P: 0, view: true, ptr: { x: 0, y: 0, tx: 0, ty: 0 }, intro: 0 };
  const st = {}; const tmpA = new THREE.Color(), tmpB = new THREE.Color(), tmpR = new THREE.Color();
  const hudPhases = [...hero.querySelectorAll('.hud__phases span')], legend = [...hero.querySelectorAll('.hero__legend span')];
  const hudCap = document.getElementById('hud-caption'), hudBar = document.getElementById('hud-bar');
  const CAPTIONS = ['Miles de señales moleculares, todavía sin orden.', 'La estructura emerge: secuencia, pureza, precisión.', 'Cada hebra, un compuesto documentado listo para tu investigación.'];
  let phase = -1, leg = -1;

  function palette(v) {
    const i = Math.min(1, Math.floor(v)), t = sm(Math.min(1, v - i)), A = PAL[i], B = PAL[Math.min(2, i + 1)];
    U.uColA.value.copy(tmpA.copy(A[0]).lerp(B[0], t));
    U.uColB.value.copy(tmpB.copy(A[1]).lerp(B[1], t));
    U.uColR.value.copy(tmpR.copy(A[2]).lerp(B[2], t));
    bgU.uC1.value.copy(U.uColA.value); bgU.uC2.value.copy(U.uColB.value);
  }
  function update(dt, t) {
    stateAt(S.P, st);
    const idle = motion ? t * 0.12 : 0;
    U.uTime.value = PU.uTime.value = bgU.uTime.value = t;
    U.uAssemble.value = st.asm * (motion ? S.intro : 1);
    U.uUnravel.value = st.un; U.uSpin.value = st.spin + idle; U.uTilt.value = st.tilt;
    U.uOpacity.value = st.op; U.uOff.value.set(st.ox, st.oy); U.uFocus.value = st.cz * 0.92;
    bgU.uGlow.value = st.glow; PU.uOpacity.value = 0.25 + 0.3 * st.op;
    palette(st.pal);
    camera.position.set(S.ptr.x * 1.1, -S.ptr.y * 0.7, st.cz);
    camera.lookAt(S.ptr.x * 0.3, -S.ptr.y * 0.2, 0);
    if (bloom) bloom.strength = 0.4 + 0.3 * st.glow;
    // HUD
    if (S.P <= 1) {
      const idx = S.P < 0.3 ? 0 : S.P < 0.64 ? 1 : 2;
      if (idx !== phase) { phase = idx; hudPhases.forEach((s, i) => s.classList.toggle('is-on', i === idx)); hudCap.textContent = CAPTIONS[idx]; }
      const l = Math.round(st.pal);
      if (l !== leg) { leg = l; legend.forEach((s, i) => s.classList.toggle('is-on', i === l)); }
      hudBar.style.transform = `scaleX(${S.P.toFixed(3)})`;
    }
  }

  /* ---------- Sizing / loop / adaptive quality ---------- */
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    composer && composer.setSize(w, h);
    const dpr = renderer.getPixelRatio();
    bgU.uRes.value.set(w * dpr, h * dpr); U.uPr.value = PU.uPr.value = dpr;
  }
  resize(); addEventListener('resize', resize);
  let raf = 0, running = false, slow = 0, frames = 0, degraded = false;
  const degrade = () => { degraded = true; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1)); if (bloom) { composer.removePass(bloom); bloom.dispose(); bloom = null; } resize(); };
  const frame = () => {
    raf = 0;
    if (document.hidden) { running = false; return; }
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (!degraded && ++frames > 90) { if (dt > 0.024) slow++; else slow = Math.max(0, slow - 1); if (slow > 24) degrade(); }
    S.ptr.x += (S.ptr.tx - S.ptr.x) * 0.05; S.ptr.y += (S.ptr.ty - S.ptr.y) * 0.05;
    update(dt, t);
    composer ? composer.render() : renderer.render(scene, camera);
    if (motion) raf = requestAnimationFrame(frame); else running = false;
  };
  const start = () => { if (!running) { running = true; clock.getDelta(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  if (fine) addEventListener('pointermove', e => { S.ptr.tx = e.clientX / innerWidth - 0.5; S.ptr.ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  /* ---------- Scroll story ---------- */
  html.classList.add('has-3d');
  if (motion) {
    const pinLen = () => Math.round(innerHeight * (mobile ? 2.6 : 3.2));
    const tl = gsap.timeline({ paused: true });
    tl.to('.hero__inner', { yPercent: -14, opacity: 0, scale: 0.96, ease: 'power2.in', duration: 1 }, 0).to({}, { duration: 2.6 });
    ScrollTrigger.create({
      trigger: hero, start: 'top top', end: () => '+=' + pinLen(), pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 5, animation: tl,
      onUpdate: self => { S.P = self.progress; hero.classList.toggle('is-story', self.progress > 0.02 && self.progress < 0.995); },
      onRefresh: self => { S.P = self.progress; },
    });
    ScrollTrigger.create({
      trigger: '.props', start: 'top bottom', endTrigger: '.footer', end: 'bottom bottom', scrub: true,
      onUpdate: self => { if (self.progress > 0) S.P = 1 + self.progress; },
    });
    const introGo = () => gsap.to(S, { intro: 1, duration: 2.8, ease: 'expo.out', delay: 0.15 });
    if (document.body.classList.contains('is-loading')) {
      const mo = new MutationObserver(() => { if (!document.body.classList.contains('is-loading')) { mo.disconnect(); introGo(); } });
      mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      setTimeout(() => { mo.disconnect(); if (S.intro === 0 && !gsap.isTweening(S)) introGo(); }, 5000);
    } else introGo();
    ScrollTrigger.refresh();
  } else {
    // Reduced motion (or no GSAP): a still, assembled helix beside the title
    S.P = 0.34; S.intro = 1; U.uBreath.value = 0;
    addEventListener('resize', () => start());
  }
  window.__dna = { get p() { return S.P; }, get degraded() { return degraded; }, get n() { return helix.geometry.attributes.position.count; } };
  update(0, 0);
  renderer.compile(scene, camera);
  start();
}

try {
  main();
} catch (e) {
  console.warn('[ahorapep/dna3d] falling back to the static hero:', e && e.message ? e.message : e);
  html.classList.remove('has-3d');
  if (stage) [...stage.querySelectorAll('canvas')].forEach(c => c.remove());
  window.__dnaFallback && window.__dnaFallback();
}
