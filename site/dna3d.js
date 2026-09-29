/* =====================================================================
   AhoraPep — dna3d.js
   A bioluminescent DNA double helix made of dense, crisp glowing
   particles that assembles from a cloud, spins/zooms, unzips from one
   end (rungs snap into sparks, strands spiral away) and re-forms behind
   the following sections — finally framed inside the Contact panel.
   Three.js r169 (importmap), GSAP ScrollTrigger (Lenis-smoothed),
   palette morphing blue → orange → pink. Fixed full-viewport stage;
   degrades to the brand video/image when WebGL or the module fails.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const html = document.documentElement;
const stage = document.getElementById('dna-stage');
const hero = document.getElementById('hero');
const frameEl = document.getElementById('dna-frame');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const mobile = innerWidth < 820 || !fine;
const hasGsap = !!(window.gsap && window.ScrollTrigger);
const motion = hasGsap && !reduced;

/* ---------- Brand palette: [strand A, strand B, rungs] per phase ---------- */
const PAL = [
  ['#3d8bff', '#8fdcff', '#eaf6ff'],   // Recuperación — electric blue
  ['#ff7a1a', '#ffc36b', '#fff0d6'],   // Energía — warm orange
  ['#ff2d95', '#ff8fe0', '#ffe4f6'],   // Longevidad — hot pink
].map(p => p.map(c => new THREE.Color(c)));

/* ---------- Scroll keyframes (P: 0..1 hero pin, 1..2 rest of page) ---------- */
const OX = mobile ? 0 : 1;
const KF = [
  // Hero (short pin): a sparse cloud gathers into the helix and zooms in as it turns orange, then the next section takes over
  { p: 0.00, fAsm: 0.00, un: 0, cz: 15.5, ox: OX * 2.3, oy: 0.2, tilt: -0.55, spin: 0.0, op: 0.9, pal: 0.0, glow: 0.4, rev: 0.1, amb: 0.14 },
  { p: 0.50, fAsm: 1.00, un: 0, cz: 11.0, ox: OX * 1.4, oy: 0.0, tilt: -0.50, spin: 1.2, op: 1.00, pal: 0.0, glow: 0.75, rev: 1.0, amb: 0.6 },
  { p: 1.00, fAsm: 1.00, un: 0.12, cz: 7.2, ox: OX * 0.5, oy: -0.1, tilt: -0.34, spin: 2.4, op: 1.00, pal: 1.0, glow: 0.9, rev: 1.0, amb: 0.7 },
  // Rest of the page: dim, dark background, helix parked in the margins away from text
  { p: 1.14, fAsm: 1.00, un: 0, cz: 14.0, ox: OX * 4.6, oy: -0.8, tilt: -0.62, spin: 3.6, op: 0.30, pal: 1.0, glow: 0.12, rev: 1.0, amb: 0.3 },
  { p: 1.46, fAsm: 1.00, un: 0, cz: 13.0, ox: OX * -4.9, oy: 0.0, tilt: -0.40, spin: 5.2, op: 0.26, pal: 0.3, glow: 0.10, rev: 1.0, amb: 0.3 },
  { p: 1.70, fAsm: 1.00, un: 0.5, cz: 13.0, ox: OX * 4.8, oy: 0.0, tilt: -0.52, spin: 6.8, op: 0.28, pal: 1.4, glow: 0.10, rev: 1.0, amb: 0.3 },
  { p: 1.86, fAsm: 1.00, un: 0, cz: 9.5, ox: 0.0, oy: 0.0, tilt: -0.12, spin: 8.0, op: 1.00, pal: 2.0, glow: 0.22, rev: 1.0, amb: 0.2 },
  { p: 2.00, fAsm: 1.00, un: 0, cz: 9.5, ox: 0.0, oy: 0.0, tilt: -0.12, spin: 8.6, op: 1.00, pal: 2.0, glow: 0.22, rev: 1.0, amb: 0.2 },
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
uniform float uTime, uAssemble, uUnravel, uSpin, uTilt, uPr, uFocus, uCoC, uSize, uOpacity, uBreath, uReveal, uAmb;
uniform vec3 uColA, uColB, uColR; uniform vec2 uOff;
attribute vec3 aHelix, aAlt, aCloud; attribute vec4 aSeed;
varying vec4 vCol; varying float vHot;
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
void main(){
  float kind = aSeed.z, rnd = aSeed.x, t = aSeed.w;
  vec3 p; float fAsm = 0.0, spark = 0.0, coc = 0.0, u = 0.0;
  if (kind > 2.5) {
    // ambient plankton: slow drift, never assembles, carries the bokeh
    p = aHelix + 0.6 * vec3(sin(uTime * 0.21 + rnd * 6.283), cos(uTime * 0.17 + rnd * 4.1), sin(uTime * 0.13 + rnd * 2.7));
  } else {
    // unzip front travels from the bottom (t=0) to the top (t=1)
    u = smoothstep(0.0, 1.0, clamp((uUnravel * 1.3 - t) / 0.3, 0.0, 1.0));
    float side = kind < 0.5 ? -1.0 : (kind < 1.5 ? 1.0 : 0.0);
    vec3 h;
    if (kind < 1.5) {
      // strands: peel out along an arc and settle into their own loose spirals (aAlt)
      h = mix(aHelix, aAlt, u);
      h.x += side * sin(u * 3.14159) * 0.9;
      h.y += sin(u * 3.14159) * 0.35 * (rnd - 0.5);
    } else {
      // rungs: snap apart into sparks that fly outward and fade
      h = mix(aHelix, aAlt, u);
      h.y -= u * u * 1.2 * rnd;
      spark = u;
    }
    vec3 local = rotZ(uTilt) * rotY(uSpin) * h;
    local += 0.045 * uBreath * vec3(sin(uTime * 0.9 + rnd * 6.283), cos(uTime * 0.7 + rnd * 3.1), sin(uTime * 0.8 + rnd * 9.4));
    vec3 cloud = aCloud + 0.45 * vec3(sin(uTime * 0.25 + rnd * 6.283), cos(uTime * 0.2 + rnd * 4.0), sin(uTime * 0.3 + rnd * 2.0));
    float lag = kind > 1.5 ? 0.22 : 0.0;                        // rungs bridge after the strands settle
    fAsm = smoothstep(0.0, 1.0, clamp((uAssemble - lag) * 1.25 + (rnd - 0.5) * 0.3, 0.0, 1.0));
    p = mix(cloud, local, fAsm);
  }
  p.xy += uOff;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = max(-mv.z, 0.5);
  if (kind > 2.5) coc = clamp(abs(d - uFocus) * uCoC, 0.0, 1.0);   // bokeh only on the depth layers
  else coc = 0.35 * (1.0 - fAsm);                                  // slight softness while still a cloud
  float sz = aSeed.y * uSize * uPr * (1.0 + coc * 3.0 + spark * 0.8 + u * 0.7) * 150.0 / d;
  float vis = kind > 2.5 ? step(rnd, uAmb) : smoothstep(rnd - 0.12, rnd, uReveal * 1.12);
  gl_PointSize = vis > 0.0 ? clamp(sz, 1.0, (kind > 2.5 ? 24.0 : 18.0) * uPr) : 0.0;
  float a = uOpacity * (1.0 - coc * 0.8) * smoothstep(44.0, 16.0, d) * (0.55 + 0.45 * aSeed.y);
  a *= (0.82 + 0.18 * sin(uTime * 1.7 + rnd * 50.0)) * vis;
  vec3 col;
  if (kind < 0.5) col = uColA;
  else if (kind < 1.5) col = uColB;
  else if (kind < 2.5) { col = mix(uColR, uColB, 0.35 + 0.4 * rnd); a *= (1.0 - spark * spark) * (0.4 + 0.6 * fAsm); }
  else { col = mix(uColA, uColB, rnd); a *= 0.2; }
  if (kind < 2.5) { col = mix(mix(uColA, uColB, rnd) * 0.8, col, fAsm); a *= 0.55 + 0.45 * fAsm; }
  vHot = kind > 2.5 ? 0.15 : (0.45 + 0.55 * fract(rnd * 9.7)) * (1.0 - 0.5 * (1.0 - fAsm)) + spark * 0.6;
  vCol = vec4(col, a);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
varying vec4 vCol; varying float vHot;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float g = exp(-r * r * 6.5) * (1.0 - smoothstep(0.7, 1.0, r));
  float core = exp(-r * r * 26.0);
  vec3 c = vCol.rgb * (0.75 + 0.5 * core) + vec3(core) * 0.55 * vHot;
  float a = vCol.a * g;
  if (a < 0.004) discard;
  gl_FragColor = vec4(c, a);
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
  const nS = mobile ? 3200 : 6200, nR = mobile ? 60 : 92, mR = mobile ? 16 : 26, nA = mobile ? 420 : 900;
  const H = 10, R = 1.45, TURNS = 2.6, TAU = Math.PI * 2, TUBE = 0.2;
  const N = nS * 2 + nR * mR + nA;
  const helix = new Float32Array(N * 3), alt = new Float32Array(N * 3), cloud = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  let i = 0;
  const put = (h, f, c, s) => { helix.set(h, i * 3); alt.set(f, i * 3); cloud.set(c, i * 3); seed.set(s, i * 4); i++; };
  const cloudPt = () => { const u = rng() * 2 - 1, ph = rng() * TAU, r = 3 + rng() * 8; const q = Math.sqrt(1 - u * u); return [Math.cos(ph) * q * r * 1.5, u * r * 0.9, Math.sin(ph) * q * r * 0.7 - 1]; };
  const strandPt = (t, s) => { const a = t * TURNS * TAU + s * Math.PI; return [Math.cos(a) * R, (t - 0.5) * H, Math.sin(a) * R]; };
  // each strand's own loose spiral, displaced sideways, used when the helix unzips
  const spiralPt = (t, s) => { const a = t * TURNS * TAU * 2.0 + s * Math.PI, side = s ? 1 : -1; return [side * 1.55 + Math.cos(a) * 0.8, (t - 0.5) * H * 1.06, Math.sin(a) * 0.8]; };
  const tube = (p, r) => { const u = rng() * 2 - 1, ph = rng() * TAU, q = Math.sqrt(1 - u * u) * r * Math.cbrt(rng()); return [p[0] + Math.cos(ph) * q, p[1] + u * r * Math.cbrt(rng()), p[2] + Math.sin(ph) * q]; };
  for (let s = 0; s < 2; s++) for (let k = 0; k < nS; k++) {
    const t = (k + rng()) / nS, o = [(rng() - 0.5) * TUBE * 1.4, (rng() - 0.5) * TUBE * 1.4, (rng() - 0.5) * TUBE * 1.4];
    const h = tube(strandPt(t, s), TUBE), f = spiralPt(t, s).map((v, d) => v + o[d]);
    put(h, f, cloudPt(), [rng(), 0.5 + rng() * 0.6, s, t]);
  }
  for (let r = 0; r < nR; r++) {
    const t = (r + 0.5) / nR, A = strandPt(t, 0), B = strandPt(t, 1);
    for (let m = 0; m < mR; m++) {
      const u = 0.06 + 0.88 * (m + rng()) / mR, h = tube(A.map((v, d) => v + (B[d] - v) * u), 0.11);
      const dir = [h[0], 0, h[2]], L = Math.hypot(dir[0], dir[2]) || 1, burst = 1.5 + rng() * 3;
      const f = [h[0] + dir[0] / L * burst + (rng() - 0.5) * 2, h[1] + (rng() - 0.3) * 2, h[2] + dir[2] / L * burst + (rng() - 0.5) * 2];
      put(h, f, cloudPt(), [rng(), 0.5 + rng() * 0.55, 2, t]);
    }
  }
  for (let k = 0; k < nA; k++) { const p = [(rng() - 0.5) * 24, (rng() - 0.5) * 14, (rng() - 0.5) * 12 - 1]; put(p, p, p, [rng(), 0.8 + rng() * 1.8, 3, 0]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(helix, 3));
  g.setAttribute('aHelix', new THREE.BufferAttribute(helix, 3));
  g.setAttribute('aAlt', new THREE.BufferAttribute(alt, 3));
  g.setAttribute('aCloud', new THREE.BufferAttribute(cloud, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  return g;
}

/* ---------- Main ---------- */
function main() {
  if (!stage || !hero) return;
  if (!window.WebGL2RenderingContext) throw new Error('no webgl2');
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: false });
  if (!renderer.getContext()) throw new Error('no context');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(0x04060d, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  stage.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mobile ? 50 : 40, 1, 0.05, 80);
  const clock = new THREE.Clock();

  const bgU = { uTime: { value: 0 }, uGlow: { value: 0.7 }, uRes: { value: new THREE.Vector2(1, 1) }, uC1: { value: PAL[0][0].clone() }, uC2: { value: PAL[0][1].clone() } };
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: bgU, depthWrite: false, depthTest: false, vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.9999, 1.0); }', fragmentShader: BG_FRAG }));
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);

  const U = {
    uTime: { value: 0 }, uAssemble: { value: 0 }, uUnravel: { value: 0 }, uSpin: { value: 0 }, uTilt: { value: -0.5 }, uPr: { value: renderer.getPixelRatio() },
    uFocus: { value: 12 }, uCoC: { value: 0.12 }, uSize: { value: mobile ? 0.9 : 1.0 }, uOpacity: { value: 1 }, uBreath: { value: 1 }, uReveal: { value: 1 }, uAmb: { value: 1 },
    uColA: { value: PAL[0][0].clone() }, uColB: { value: PAL[0][1].clone() }, uColR: { value: PAL[0][2].clone() }, uOff: { value: new THREE.Vector2() },
  };
  const helix = new THREE.Points(buildHelix(), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  helix.frustumCulled = false; scene.add(helix);

  // bloom: tight radius so the strands stay crisp (desktop only)
  let composer = null, bloom = null;
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.18, 0.72);
    composer.addPass(bloom); composer.addPass(new OutputPass());
  }

  /* ---------- State ---------- */
  const S = { P: 0, ptr: { x: 0, y: 0, tx: 0, ty: 0 }, intro: 0 };
  const st = {}; const tmpA = new THREE.Color(), tmpB = new THREE.Color(), tmpR = new THREE.Color();
  const hudPhases = [...hero.querySelectorAll('.hud__phases span')], legend = [...hero.querySelectorAll('.hero__legend span')];
  const hudCap = document.getElementById('hud-caption'), hudBar = document.getElementById('hud-bar');
  const CAPTIONS = ['Unas pocas señales moleculares, todavía sin orden.', 'La estructura emerge: secuencia, pureza, precisión.', 'La hélice se enciende: cada hebra, un compuesto documentado.'];
  let phase = -1, leg = -1;

  function palette(v) {
    const i = Math.min(1, Math.floor(v)), t = sm(Math.min(1, v - i)), A = PAL[i], B = PAL[Math.min(2, i + 1)];
    U.uColA.value.copy(tmpA.copy(A[0]).lerp(B[0], t));
    U.uColB.value.copy(tmpB.copy(A[1]).lerp(B[1], t));
    U.uColR.value.copy(tmpR.copy(A[2]).lerp(B[2], t));
    bgU.uC1.value.copy(U.uColA.value); bgU.uC2.value.copy(U.uColB.value);
  }
  // Contact panel: aim the helix at the framed window (world offset at z=0 for the panel centre)
  function frameTarget(cz) {
    if (!frameEl) return null;
    const r = frameEl.getBoundingClientRect();
    if (r.width === 0) return null;
    const nx = ((r.left + r.width / 2) / innerWidth) * 2 - 1, ny = 1 - ((r.top + r.height / 2) / innerHeight) * 2;
    const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * cz;
    return { x: nx * hh * camera.aspect, y: ny * hh, fit: (r.height / innerHeight) * hh * 2 };
  }
  function update(dt, t) {
    stateAt(S.P, st);
    const idle = motion ? t * 0.12 : 0;
    let ox = st.ox, oy = st.oy, cz = st.cz;
    if (S.P > 1.74) {
      const w = sm(Math.min(1, (S.P - 1.74) / 0.14)), f = frameTarget(cz);
      if (f) { ox += (f.x - ox) * w; oy += (f.y - oy) * w; }
    }
    U.uTime.value = bgU.uTime.value = t;
    U.uAssemble.value = st.fAsm * (motion ? S.intro : 1);
    U.uUnravel.value = st.un; U.uSpin.value = st.spin + idle; U.uTilt.value = st.tilt;
    U.uOpacity.value = st.op; U.uOff.value.set(ox, oy); U.uFocus.value = cz;
    U.uReveal.value = st.rev; U.uAmb.value = st.amb;
    bgU.uGlow.value = st.glow;
    palette(st.pal);
    camera.position.set(S.ptr.x * 1.1, -S.ptr.y * 0.7, cz);
    camera.lookAt(S.ptr.x * 0.3, -S.ptr.y * 0.2, 0);
    if (bloom) bloom.strength = 0.18 + 0.16 * st.glow;
    if (S.P <= 1) {
      const idx = S.P < 0.3 ? 0 : S.P < 0.72 ? 1 : 2;
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
    bgU.uRes.value.set(w * dpr, h * dpr); U.uPr.value = dpr;
  }
  resize(); addEventListener('resize', resize);
  let raf = 0, running = false, slow = 0, frames = 0, degraded = 0;
  const degrade = () => {
    degraded++; slow = 0; frames = 0;
    if (degraded === 1) renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    else { renderer.setPixelRatio(1); if (bloom) { composer.removePass(bloom); bloom.dispose(); bloom = null; } }
    resize();
  };
  const frame = () => {
    raf = 0;
    if (document.hidden) { running = false; return; }
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (degraded < 2 && ++frames > 90) { if (dt > 0.024) slow++; else slow = Math.max(0, slow - 1); if (slow > 24) degrade(); }
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
    const pinLen = () => Math.round(innerHeight * (mobile ? 1.0 : 1.1));
    const tl = gsap.timeline({ paused: true });
    tl.to('.hero__inner', { yPercent: -14, opacity: 0, scale: 0.96, ease: 'power2.in', duration: 1 }, 0).to({}, { duration: 1.2 });
    ScrollTrigger.create({
      trigger: hero, start: 'top top', end: () => '+=' + pinLen(), pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 5, animation: tl,
      onUpdate: self => { S.P = self.progress; hero.classList.toggle('is-story', self.progress > 0.02); },
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
    S.P = 0.34; S.intro = 1; U.uBreath.value = 0;
    addEventListener('resize', () => start());
  }
  window.__dna = { get p() { return S.P; }, get degraded() { return degraded; }, get n() { return helix.geometry.attributes.position.count; }, get dpr() { return renderer.getPixelRatio(); } };
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
