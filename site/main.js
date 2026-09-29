/* =====================================================================
   AhoraPep — main.js
   Gate, nav, smooth scroll, reveals, catalog (live API → bundled
   fallback), cart drawer (localStorage), WhatsApp quote, media.
   ===================================================================== */
(() => {
  'use strict';

  /* ---------- Config ---------- */
  // TODO(Juan): set the business WhatsApp number in international format, digits only (e.g. '18095551234').
  const WHATSAPP = '1809XXXXXXX';
  const API_URL = '/api/inventory?available_only=true';
  const FALLBACK_URL = 'assets/data/inventory.json';
  const LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname) || location.protocol === 'file:';
  const LS = { ack: 'ap_ack_v1', cart: 'ap_cart_v1' };
  // Pricing / visibility rules applied on top of the inventory feed
  const MARKUP = 1.15;                      // +15% over the feed price, rounded to RD$10
  const HIDDEN = [/^reta/i];                // products taken off the catalog (Retatrutide)

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (reduced) html.classList.add('no-motion');
  if (!hasGsap) html.classList.add('no-gsap');

  const fmt = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 });
  const money = n => fmt.format(n).replace(/ /g, '');

  /* ---------- Display names (raw API name → clean label) ---------- */
  const NAMES = {
    '5 amino 1 mq': '5-Amino-1MQ', 'bac water hospira': 'Agua bacteriostática Hospira', 'bac water': 'Agua bacteriostática',
    'bpc157 + tb500': 'BPC-157 + TB-500', 'cerebroprotein (hydrolysate)': 'Cerebroprotein (hidrolizado)', 'cjc-1295 dac': 'CJC-1295 DAC',
    'cjc1295 no dac + ipamorelin': 'CJC-1295 (sin DAC) + Ipamorelin', 'ghk-cu': 'GHK-Cu', 'mots-c': 'MOTS-c', 'nad (buffered)': 'NAD+ (buffered)',
    'pt141': 'PT-141', 'ss31': 'SS-31', 'tesamorelin': 'Tesamorelin', 'semaglutide': 'Semaglutida', 'tirzepatide': 'Tirzepatida', 'retatrutide': 'Retatrutida',
  };
  const CATS = { peptide: 'Péptido de investigación', supply: 'Suministro de laboratorio' };
  const CAT_DESC = { peptide: 'Compuesto liofilizado de grado de investigación. Documentación de soporte disponible al cotizar.', supply: 'Material auxiliar para reconstitución y manejo en laboratorio.' };
  const HUES = ['#3d8bff', '#ff7a1a', '#ff2d95', '#7dd3fc', '#ffb347', '#ff7ad9'];

  /* ---------- Gate ---------- */
  const gate = $('#gate');
  let ack = false;
  try { ack = localStorage.getItem(LS.ack) === '1'; } catch (e) {}
  if (!ack && gate) {
    gate.hidden = false; document.body.classList.add('is-gated');
    $('#gate-ok').addEventListener('click', () => {
      try { localStorage.setItem(LS.ack, '1'); } catch (e) {}
      gate.hidden = true; document.body.classList.remove('is-gated');
    });
  }

  /* ---------- Loader ---------- */
  const lift = () => document.body.classList.remove('is-loading');
  if (document.readyState === 'complete') setTimeout(lift, 300);
  else addEventListener('load', () => setTimeout(lift, 300));
  setTimeout(lift, 4000);

  /* ---------- Nav ---------- */
  const nav = $('#nav');
  const burger = $('#nav-burger');
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  $$('#nav-links a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }));

  /* ---------- Smooth scroll + scroll-linked UI ---------- */
  let lenis = null;
  if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger);
    if (window.Lenis && !reduced) {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      window.lenis = lenis;
    }
    let lastY = 0;
    ScrollTrigger.create({
      onUpdate: self => {
        const y = self.scroll();
        nav.classList.toggle('is-scrolled', y > 40);
        nav.classList.toggle('is-hidden', y > 400 && y > lastY + 4 && !nav.classList.contains('is-open'));
        lastY = y;
      },
    });
    // Reveals
    if (!reduced) {
      ScrollTrigger.batch('.reveal', {
        start: 'top 88%', once: true,
        onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.08, overwrite: true }),
      });
      // Science: scrubbed word reveal
      const st = $('#science-text');
      if (st) {
        st.innerHTML = st.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
        const words = $$('.w', st);
        ScrollTrigger.create({
          trigger: st, start: 'top 80%', end: 'bottom 45%', scrub: 0.3,
          onUpdate: self => { const n = Math.round(self.progress * words.length); words.forEach((w, i) => w.classList.toggle('is-on', i < n)); },
        });
      }
    } else $$('.science__text .w').forEach(w => w.classList.add('is-on'));
  }
  // Anchor links
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id === '#') return;
    const target = id === '#top' ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.5, offset: id === '#top' ? 0 : -60 });
    else (target === 0 ? window.scrollTo({ top: 0, behavior: 'smooth' }) : target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }));
  }));

  /* ---------- No-WebGL fallback media (called by dna3d.js or by timeout) ---------- */
  const mobile = innerWidth < 820;
  const addSources = (v, webm, mp4) => {
    if (!v || v.dataset.ready) return; v.dataset.ready = '1';
    const s1 = document.createElement('source'); s1.src = webm; s1.type = 'video/webm';
    const s2 = document.createElement('source'); s2.src = mp4; s2.type = 'video/mp4';
    v.append(s1, s2); v.load(); v.play().catch(() => {});
  };
  window.__dnaFallback = () => {
    html.classList.add('no-3d');
    if (reduced) return;
    const v = $('#fallback-video');
    addSources(v, v.dataset[mobile ? 'mobileWebm' : 'desktopWebm'], v.dataset[mobile ? 'mobileMp4' : 'desktopMp4']);
  };
  setTimeout(() => { if (!html.classList.contains('has-3d') && !html.classList.contains('no-3d')) window.__dnaFallback(); }, 7000);
  /* ---------- Toast ---------- */
  const toastEl = $('#toast'); let toastT = 0;
  const toast = msg => { toastEl.textContent = msg; toastEl.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('is-on'), 2200); };

  /* ---------- Catalog ---------- */
  const grid = $('#cat-grid'), status = $('#cat-status'), search = $('#cat-search'), filter = $('#cat-filter');
  let groups = [], cat = 'all', q = '';
  const SENSITIVE = ['wholesale_price', 'suggested_retail', 'margin_pct', 'qty'];
  const clean = p => ({ id: p.id, name: String(p.name || '').trim(), category: p.category || 'peptide', dosage: String(p.dosage || ''), price: Math.round((Number(p.price) || 0) * MARKUP / 10) * 10, available: p.available !== false });
  const hidden = p => HIDDEN.some(re => re.test(p.name));
  const doseNum = d => parseFloat(String(d).replace(',', '.')) || 0;
  const label = n => NAMES[n.toLowerCase()] || n;
  const hueIdx = s => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length;
  const hue = s => HUES[hueIdx(s)];
  const line = s => hueIdx(s) % 3;
  const announce = (g, v) => { window.__apProduct = { name: g.name, dosage: v.dosage, line: line(g.raw) }; dispatchEvent(new CustomEvent('ap:product', { detail: window.__apProduct })); };

  function group(products) {
    const map = new Map();
    products.filter(p => p.available && !hidden(p)).forEach(p => {
      const key = p.name.toLowerCase() + '|' + p.category;
      if (!map.has(key)) map.set(key, { key, name: label(p.name), raw: p.name, category: p.category, variants: [] });
      map.get(key).variants.push(p);
    });
    return [...map.values()].map(g => { g.variants.sort((a, b) => doseNum(a.dosage) - doseNum(b.dosage)); return g; })
      .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name, 'es') : a.category === 'peptide' ? -1 : 1));
  }

  async function loadInventory() {
    grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('');
    let data = null, source = 'live';
    if (!LOCAL) {
      try {
        const r = await fetch(API_URL, { headers: { accept: 'application/json' } });
        if (r.ok) data = await r.json();
      } catch (e) { /* fall through */ }
    }
    if (!data || !Array.isArray(data.products)) {
      source = 'fallback';
      try { data = await (await fetch(FALLBACK_URL)).json(); } catch (e) { data = { products: [] }; }
    }
    const products = data.products.map(clean);
    SENSITIVE.forEach(k => data.products.forEach(p => delete p[k]));
    groups = group(products);
    syncCart(products);
    grid.setAttribute('aria-busy', 'false');
    grid.dataset.source = source;
    render();
  }

  function card(g) {
    const multi = g.variants.length > 1;
    const c = hue(g.raw);
    const fill = 45 + (doseNum(g.variants[0].dosage) % 40);
    return `<article class="card" data-key="${g.key}" data-line="${line(g.raw)}" style="--c:${c};--c-glow:${c}55">
      <div class="card__top">
        <div class="vial" aria-hidden="true"><div class="vial__cap"></div><div class="vial__neck"></div><div class="vial__body"><div class="vial__liquid" style="--fill:${fill}%"></div><div class="vial__glint"></div></div></div>
        <div class="card__meta">
          <p class="card__cat">${CATS[g.category] || g.category}</p>
          <h3 class="card__name">${g.name}</h3>
          <p class="card__desc">${CAT_DESC[g.category] || ''}</p>
        </div>
      </div>
      ${multi
        ? `<div class="card__doses" role="group" aria-label="Presentación">${g.variants.map((v, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${v.dosage}</button>`).join('')}</div>`
        : `<span class="card__dose-single">${g.variants[0].dosage}</span>`}
      <div class="card__foot">
        <div class="card__price"><small>Precio unitario</small><span data-price>${money(g.variants[0].price)}</span></div>
        <button class="card__add" type="button" data-add>Agregar <span aria-hidden="true">+</span></button>
      </div>
    </article>`;
  }

  function render() {
    const needle = q.trim().toLowerCase();
    const list = groups.filter(g => (cat === 'all' || g.category === cat) && (!needle || g.name.toLowerCase().includes(needle) || g.raw.toLowerCase().includes(needle)));
    grid.innerHTML = list.length ? list.map(card).join('') : '<div class="catalog__empty">Sin resultados. Prueba con otro nombre o escríbenos por WhatsApp.</div>';
    const n = list.reduce((a, g) => a + g.variants.length, 0);
    status.textContent = `${list.length} compuesto${list.length === 1 ? '' : 's'} · ${n} presentaci${n === 1 ? 'ón' : 'ones'}`;
    if (hasGsap && !reduced) gsap.fromTo('.card', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.04, ease: 'power3.out', clearProps: 'transform' });
    if (list.length) announce(list[0], list[0].variants[0]);
  }
  grid.addEventListener('pointerover', e => {
    const art = e.target.closest('.card'); if (!art || art === grid._hover) return;
    grid._hover && grid._hover.classList.remove('is-active'); grid._hover = art; art.classList.add('is-active');
    const g = groups.find(x => x.key === art.dataset.key); if (g) announce(g, g.variants[+(art.dataset.i || 0)]);
  });

  grid.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el) return;
    const art = el.closest('.card'); const g = groups.find(x => x.key === art.dataset.key); if (!g) return;
    if (el.dataset.i !== undefined) {
      $$('.card__doses button', art).forEach(b => b.setAttribute('aria-pressed', String(b === el)));
      art.dataset.i = el.dataset.i;
      $('[data-price]', art).textContent = money(g.variants[+el.dataset.i].price);
      announce(g, g.variants[+el.dataset.i]);
    } else if (el.hasAttribute('data-add')) {
      const v = g.variants[+(art.dataset.i || 0)];
      cartAdd({ id: v.id, name: g.name, dosage: v.dosage, price: v.price });
      toast(`${g.name} ${v.dosage} agregado a tu cotización`);
    }
  });
  filter.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', filter).forEach(x => x.setAttribute('aria-selected', String(x === b)));
    cat = b.dataset.cat; render();
  });
  search.addEventListener('input', () => { q = search.value; render(); });
  loadInventory();

  /* ---------- Cart ---------- */
  const cartEl = $('#cart'), backdrop = $('#cart-backdrop'), itemsEl = $('#cart-items'), totalEl = $('#cart-total'), countEl = $('#cart-count'), checkout = $('#cart-checkout');
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(LS.cart) || '[]'); if (!Array.isArray(cart)) cart = []; } catch (e) { cart = []; }
  const save = () => { try { localStorage.setItem(LS.cart, JSON.stringify(cart)); } catch (e) {} };
  const total = () => cart.reduce((a, i) => a + i.price * i.qty, 0);

  // saved quotes: drop hidden/unavailable items and refresh prices from the catalog
  function syncCart(products) {
    const byId = new Map(products.filter(p => p.available && !hidden(p)).map(p => [String(p.id), p]));
    cart = cart.filter(i => byId.has(String(i.id)));
    cart.forEach(i => { i.price = byId.get(String(i.id)).price; });
    save(); renderCart();
  }
  function cartAdd(item) {
    const ex = cart.find(i => i.id === item.id);
    if (ex) ex.qty += 1; else cart.push({ ...item, qty: 1 });
    save(); renderCart(); nav.classList.remove('is-hidden');
    if (hasGsap && !reduced) gsap.fromTo(countEl, { scale: 1.5 }, { scale: 1, duration: 0.5, ease: 'back.out(2)' });
  }
  function waMessage() {
    const lines = cart.map(i => `• ${i.name} ${i.dosage} × ${i.qty} — ${money(i.price * i.qty)}`);
    return [
      'Hola AhoraPep, quiero cotizar los siguientes compuestos de investigación:', '',
      ...lines, '',
      `Total estimado: ${money(total())} (sin envío)`, '',
      'Confirmo que son para uso exclusivo en investigación.',
    ].join('\n');
  }
  const waLink = text => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;

  function renderCart() {
    const n = cart.reduce((a, i) => a + i.qty, 0);
    countEl.textContent = n; countEl.hidden = n === 0;
    totalEl.textContent = money(total());
    itemsEl.innerHTML = cart.length ? cart.map((i, k) => `<div class="cart-item" data-k="${k}">
      <div><div class="cart-item__name">${i.name}</div><div class="cart-item__dose">${i.dosage}</div></div>
      <div class="cart-item__price">${money(i.price * i.qty)}</div>
      <div class="cart-item__qty"><div class="qty"><button type="button" data-d="-1" aria-label="Quitar uno">−</button><span>${i.qty}</span><button type="button" data-d="1" aria-label="Agregar uno">+</button></div><button class="cart-item__remove" type="button" data-rm>Eliminar</button></div>
    </div>`).join('') : '<p class="cart__empty">Tu cotización está vacía. Agrega compuestos desde el catálogo.</p>';
    checkout.setAttribute('aria-disabled', String(!cart.length));
    checkout.href = cart.length ? waLink(waMessage()) : '#';
  }
  itemsEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = +b.closest('.cart-item').dataset.k;
    if (b.hasAttribute('data-rm')) cart.splice(k, 1);
    else { cart[k].qty += +b.dataset.d; if (cart[k].qty <= 0) cart.splice(k, 1); }
    save(); renderCart();
  });
  $('#cart-clear').addEventListener('click', () => { cart = []; save(); renderCart(); });
  const openCart = () => { cartEl.classList.add('is-open'); cartEl.removeAttribute('inert'); cartEl.setAttribute('aria-hidden', 'false'); backdrop.hidden = false; lenis && lenis.stop(); document.body.style.overflow = 'hidden'; $('#cart-close').focus(); };
  const closeCart = () => { cartEl.classList.remove('is-open'); cartEl.setAttribute('inert', ''); cartEl.setAttribute('aria-hidden', 'true'); backdrop.hidden = true; lenis && lenis.start(); document.body.style.overflow = ''; $('#cart-open').focus(); };
  $('#cart-open').addEventListener('click', openCart);
  $('#cart-close').addEventListener('click', closeCart);
  backdrop.addEventListener('click', closeCart);
  addEventListener('keydown', e => { if (e.key === 'Escape' && cartEl.classList.contains('is-open')) closeCart(); });
  checkout.addEventListener('click', e => { if (!cart.length) e.preventDefault(); else if (WHATSAPP.includes('X')) { e.preventDefault(); toast('Número de WhatsApp pendiente de configurar'); } });
  renderCart();

  /* ---------- Contact links ---------- */
  const waGeneric = waLink('Hola AhoraPep, me gustaría recibir información y cotizar compuestos de investigación.');
  ['#contact-wa', '#contact-wa-btn'].forEach(s => { const a = $(s); if (a) a.href = waGeneric; });
  $('#year').textContent = new Date().getFullYear();
})();
