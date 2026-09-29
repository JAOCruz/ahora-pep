/* =====================================================================
   AhoraPep — vial3d.js
   One photoreal-ish glass peptide vial introducing the catalog:
   lathe glass (transmission on desktop, fake glass on mobile), aluminium
   crimp + coloured flip-off cap, lyophilised cake, wrap-around canvas
   label. Renders in its own small alpha canvas only while visible.
   Listens to `ap:product` {name, dosage, line} to re-label / recolour.
   ===================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const host = document.getElementById('vial-stage');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const mobile = innerWidth < 820 || !fine;
const LINE = ['#3d8bff', '#ff7a1a', '#ff2d95'];
const LINE_NAME = ['Recuperación', 'Energía', 'Longevidad'];

// The label wraps ~340° of the vial; the canvas is laid out so its middle third is what faces the camera.
function labelCanvas() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 640;
  return c;
}
function drawLabel(c, { name, dosage, line }) {
  const x = c.getContext('2d'), W = c.width, H = c.height, col = LINE[line] || LINE[0];
  const L = W / 3, R = (W * 2) / 3, CX = W / 2;   // front panel spans [L, R]
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#f5f2ea'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  // brand band all the way round
  const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, shade(col, -30)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -30));
  x.fillStyle = g; x.fillRect(0, 0, W, 118);
  x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillStyle = '#fff';
  x.font = 'italic 76px "Instrument Serif", Georgia, serif'; x.fillText('AhoraPep', CX, 62);
  // front panel: name + dose, big and centred
  x.fillStyle = '#10131c'; fitText(x, name, CX, 212, (R - L) * 0.78, 84);
  x.fillStyle = col; x.font = '700 150px Manrope, system-ui, sans-serif'; x.fillText(dosage, CX, 356);
  x.fillStyle = '#4a5063'; x.font = '600 26px Manrope, system-ui, sans-serif'; x.letterSpacing = '4px';
  x.fillText('PÉPTIDO DE INVESTIGACIÓN · LIOFILIZADO', CX, 470); x.letterSpacing = '0px';
  // left panel: line name; right panel: short barcode + lot
  x.fillStyle = col; x.font = '700 30px Manrope, system-ui, sans-serif'; x.letterSpacing = '6px';
  x.fillText(LINE_NAME[line].toUpperCase(), L / 2 + 60, 300); x.letterSpacing = '0px';
  x.fillStyle = '#10131c';
  let bx = R + 90; for (let i = 0; i < 22; i++) { const w = 3 + ((i * 7) % 5); if (i % 3 !== 1) x.fillRect(bx, 250, w, 110); bx += w + 5; }
  x.textAlign = 'left'; x.font = '500 24px Manrope, system-ui, sans-serif'; x.fillStyle = '#5a6072'; x.fillText('LOTE AP-2026', R + 90, 400);
  // warning band
  x.fillStyle = '#10131c'; x.fillRect(0, H - 56, W, 56);
  x.fillStyle = '#fff'; x.font = '700 24px Manrope, system-ui, sans-serif'; x.letterSpacing = '5px'; x.textAlign = 'center';
  x.fillText('RESEARCH USE ONLY · NOT FOR HUMAN CONSUMPTION', CX, H - 28); x.letterSpacing = '0px'; x.textAlign = 'left';
}
function fitText(x, text, px, py, maxW, size) {
  let s = size; x.font = `700 ${s}px Manrope, system-ui, sans-serif`;
  while (x.measureText(text).width > maxW && s > 34) { s -= 2; x.font = `700 ${s}px Manrope, system-ui, sans-serif`; }
  x.fillText(text, px, py);
}
function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, v + d)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

function main() {
  if (!host) return;
  if (!window.WebGL2RenderingContext) throw new Error('no webgl2');
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no context');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
  camera.position.set(0, 1.55, 7.4); camera.lookAt(0, 1.22, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // soft backdrop glow (kept low so the refraction doesn't compete with the label)
  const glowU = { uCol: { value: new THREE.Color(LINE[0]) } };
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShaderMaterial({
    uniforms: glowU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uCol; varying vec2 vUv;
      void main(){ vec2 d = vUv - vec2(0.5, 0.52); float r = length(d * vec2(1.0, 1.3));
        gl_FragColor = vec4(uCol, exp(-r * r * 10.0) * 0.32); }`,
  }));
  glow.position.set(0, 1.3, -3.2); scene.add(glow);

  // lights
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 6, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe4ff, 1.2); rim.position.set(-4, 3, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0x8090b0, 0.35));

  /* ---------- Vial ---------- */
  const vial = new THREE.Group(); scene.add(vial);
  const seg = mobile ? 48 : 96;
  const profile = [[0, 0], [0.5, 0], [0.6, 0.06], [0.63, 0.2], [0.63, 1.55], [0.6, 1.68], [0.44, 1.8], [0.35, 1.9], [0.34, 2.14], [0.43, 2.2], [0.43, 2.34], [0.3, 2.34], [0.3, 2.2], [0.27, 2.14], [0.27, 1.92], [0.42, 1.76], [0.54, 1.6], [0.55, 0.22], [0.5, 0.1], [0, 0.1]].map(p => new THREE.Vector2(p[0], p[1]));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(profile, seg), mobile
    ? new THREE.MeshPhysicalMaterial({ color: 0xdfefff, transparent: true, opacity: 0.26, roughness: 0.08, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.1, envMapIntensity: 0.9, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, ior: 1.5, thickness: 0.7, roughness: 0.08, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.1, envMapIntensity: 0.7, attenuationColor: new THREE.Color(0xe8f4ff), attenuationDistance: 2.5, side: THREE.DoubleSide }));
  vial.add(glass);
  // lyophilised cake
  const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.26, seg / 2, 1), new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.95, metalness: 0, emissive: 0x222222 }));
  cake.position.y = 0.24; vial.add(cake);
  const cakeTop = new THREE.Mesh(new THREE.CircleGeometry(0.5, seg / 2), new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 1 }));
  cakeTop.rotation.x = -Math.PI / 2; cakeTop.position.y = 0.371; vial.add(cakeTop);
  // aluminium crimp
  const alu = new THREE.MeshStandardMaterial({ color: 0xd9dde6, metalness: 1, roughness: 0.32, envMapIntensity: 1.4 });
  const crimp = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.3, seg, 1), alu); crimp.position.y = 2.36; vial.add(crimp);
  const crimpLip = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 12, seg), alu); crimpLip.rotation.x = Math.PI / 2; crimpLip.position.y = 2.22; vial.add(crimpLip);
  // ribs on the crimp
  const ribGeo = new THREE.BoxGeometry(0.02, 0.22, 0.03);
  for (let i = 0; i < (mobile ? 24 : 48); i++) { const r = new THREE.Mesh(ribGeo, alu); const a = (i / (mobile ? 24 : 48)) * Math.PI * 2; r.position.set(Math.cos(a) * 0.47, 2.36, Math.sin(a) * 0.47); r.rotation.y = -a; vial.add(r); }
  // flip-off top (coloured)
  const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(LINE[0]), roughness: 0.45, metalness: 0.15, envMapIntensity: 0.8 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.14, seg, 1), capMat); cap.position.y = 2.58; vial.add(cap);
  const capDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, seg, 1), new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.6, metalness: 0.2 })); capDisc.position.y = 2.66; vial.add(capDisc);
  // wrap-around label
  const lc = labelCanvas(); drawLabel(lc, { name: 'Péptido de investigación', dosage: '—', line: 0 });
  const ltex = new THREE.CanvasTexture(lc); ltex.colorSpace = THREE.SRGBColorSpace; ltex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); 
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.642, 0.642, 1.2, seg, 1, true, Math.PI * 1.05, Math.PI * 1.9), new THREE.MeshStandardMaterial({ map: ltex, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }));
  label.position.y = 0.9; vial.add(label);
  vial.position.y = -0.05;

  /* ---------- Interaction / state ---------- */
  const S = { turn: 0, tx: 0, ty: 0, x: 0, y: 0, visible: true, dirty: true };
  const caption = document.getElementById('vial-caption');
  const esc = v => String(v).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  let current = { name: 'Péptido de investigación', dosage: '—', line: 0 };
  function setProduct(p) {
    if (!p || (p.name === current.name && p.dosage === current.dosage && p.line === current.line)) return;
    current = { name: p.name, dosage: p.dosage || '—', line: +p.line || 0 };
    drawLabel(lc, current); ltex.needsUpdate = true;
    const target = new THREE.Color(LINE[current.line]);
    if (window.gsap && !reduced) { gsap.to(capMat.color, { r: target.r, g: target.g, b: target.b, duration: 0.6 }); gsap.to(glowU.uCol.value, { r: target.r, g: target.g, b: target.b, duration: 0.8 }); gsap.to(S, { turn: Math.round(S.turn / (Math.PI * 2) + 1) * Math.PI * 2, duration: 1.1, ease: 'power3.out', overwrite: true }); }
    else { capMat.color.copy(target); glowU.uCol.value.copy(target); }
    if (caption) caption.innerHTML = `<b>${esc(current.name)}</b><span>${esc(current.dosage)}</span>`;
    S.dirty = true; start();
  }
  addEventListener('ap:product', e => setProduct(e.detail));
  if (fine) host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); S.tx = (e.clientX - r.left) / r.width - 0.5; S.ty = (e.clientY - r.top) / r.height - 0.5; }, { passive: true });
  host.addEventListener('pointerleave', () => { S.tx = 0; S.ty = 0; });

  function resize() {
    const w = host.clientWidth || 360, h = host.clientHeight || 440;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); S.dirty = true;
  }
  resize(); addEventListener('resize', resize);

  const clock = new THREE.Clock();
  let raf = 0, running = false;
  const frame = () => {
    raf = 0;
    if (!S.visible || document.hidden) { running = false; return; }
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    const sway = reduced ? 0 : Math.sin(t * 0.45) * 0.42;
    if (!reduced) vial.position.y = -0.05 + Math.sin(t * 0.9) * 0.04;
    S.x += (S.tx - S.x) * 0.08; S.y += (S.ty - S.y) * 0.08;
    vial.rotation.set(S.y * 0.3 - 0.06, S.turn + sway + S.x * 0.9, 0);
    renderer.render(scene, camera);
    if (!reduced) raf = requestAnimationFrame(frame); else running = false;
  };
  const start = () => { if (!running) { running = true; clock.getDelta(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(en => { S.visible = en[0].isIntersecting; if (S.visible) start(); }, { threshold: 0 }).observe(host);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  document.fonts && document.fonts.ready.then(() => { drawLabel(lc, current); ltex.needsUpdate = true; start(); });
  host.classList.add('is-3d');
  if (window.__apProduct) setProduct(window.__apProduct);
  window.__vial = { get product() { return current; }, setProduct };
  renderer.compile(scene, camera);
  start();
}

try { main(); } catch (e) {
  console.warn('[ahorapep/vial3d] vial disabled:', e && e.message ? e.message : e);
  host && host.classList.add('is-off');
}
