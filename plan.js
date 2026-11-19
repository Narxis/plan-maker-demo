// PLAN tab: load a photo, crop it with 4 handles, clean it, then erase/draw by hand.
import { state, bump, resetPlan } from './state.js';
import { outputSize, warp, rotate90 } from './warp.js';
import { inkMask, removeSpecks } from './filter.js';
import { straighten } from './straighten.js';
import { snapCorner } from './snap.js';
import { el, icon, toast, clamp } from './ui.js';

const MAX_PHOTO = 2000;
const MAX_WARP = 1600;
const MAX_UNDO = 20;

let root = null;
const refresh = () => renderPlan(root);

export function renderPlan(main) {
  root = main;
  main.replaceChildren();
  const left = el('div', 'col');
  const right = el('div', 'col');
  main.append(left, right);
  if (state.step === 'crop' && state.source) cropView(left);
  else if (state.step === 'clean' && state.base) cleanView(left, right);
  else emptyView(left);
}

// ---------- loading ----------

const toImageData = (r) => new ImageData(r.data, r.width, r.height);

function loadImage(url) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error('load'));
    img.src = url;
  });
}

function rasterize(img, max, upscale) {
  const nw = img.naturalWidth || 1600;
  const nh = img.naturalHeight || Math.round(1600 * 0.7);
  let k = max / Math.max(nw, nh);
  if (!upscale) k = Math.min(1, k);
  const w = Math.max(1, Math.round(nw * k));
  const h = Math.max(1, Math.round(nh * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

const insetCorners = (s, m = 0.05) => [
  { x: s.width * m, y: s.height * m }, { x: s.width * (1 - m), y: s.height * m },
  { x: s.width * (1 - m), y: s.height * (1 - m) }, { x: s.width * m, y: s.height * (1 - m) },
];

function setSource(src) {
  resetPlan();
  state.source = src;
  state.corners = insetCorners(src);
  state.step = 'crop';
  refresh();
}

async function fromFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    setSource(rasterize(await loadImage(url), MAX_PHOTO, false));
  } catch {
    toast("Impossible de lire cette image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fromSample() {
  try {
    // Same release version as this module (?v=...), so the sample is never a stale cached copy.
    const url = new URL('sample-plan.svg' + new URL(import.meta.url).search, import.meta.url);
    setSource(rasterize(await loadImage(url.href), 1600, true));
  } catch {
    toast("Impossible de charger le plan d'exemple.");
  }
}

function emptyView(left) {
  const card = el('section', 'card');
  card.innerHTML = `<h2 class="section">Plan</h2>
    <p class="hint">Aucun plan chargé. Prenez le plan d'évacuation en photo.</p>
    <div class="actions">
      <button class="btn" data-a="photo">${icon('photo')}Prendre une photo</button>
      <button class="btn flat" data-a="sample">${icon('image')}Plan d'exemple</button>
    </div>`;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment');
  input.hidden = true;
  input.onchange = () => fromFile(input.files[0]);
  card.append(input);
  card.querySelector('[data-a=photo]').onclick = () => input.click();
  card.querySelector('[data-a=sample]').onclick = fromSample;
  left.append(card);
}

// ---------- crop ----------


function cropView(left) {
  const s = state.source;
  const card = el('section', 'card');
  card.innerHTML = `<h2 class="section">Recadrage</h2>
    <div class="crop-pad"><div class="stage">
      <canvas width="${s.width}" height="${s.height}"></canvas>
      <svg class="lines" viewBox="0 0 ${s.width} ${s.height}" preserveAspectRatio="none"><polygon/></svg>
    </div></div>
    <p class="hint">Glissez les 4 repères sur les coins du plan.</p>
    <div class="tools">
      <button class="tool" data-a="rot">${icon('rotate')}Pivoter</button>
      <button class="tool" data-a="snap" aria-pressed="${state.cropSnap}">${icon('magnet')}Magnétisme</button>
      <button class="tool primary" data-a="ok">${icon('check')}Valider le recadrage</button>
    </div>`;
  left.append(card);
  const stage = card.querySelector('.stage');
  stage.querySelector('canvas').getContext('2d').putImageData(toImageData(s), 0, 0);
  const poly = stage.querySelector('polygon');

  const handles = state.corners.map((_, i) => {
    const h = el('div', 'handle');
    h.setAttribute('aria-label', `Repère ${i + 1}`);
    stage.append(h);
    h.addEventListener('pointerdown', (e) => { h.setPointerCapture(e.pointerId); e.preventDefault(); });
    h.addEventListener('pointermove', (e) => {
      if (!h.hasPointerCapture(e.pointerId)) return;
      const r = stage.getBoundingClientRect();
      const p = {
        x: clamp((e.clientX - r.left) / r.width, 0, 1) * s.width,
        y: clamp((e.clientY - r.top) / r.height, 0, 1) * s.height,
      };
      state.corners[i] = state.cropSnap ? snapCorner(state.corners, i, p) : p;
      place();
    });
    return h;
  });
  function place() {
    state.corners.forEach((c, i) => {
      handles[i].style.left = `${(c.x / s.width) * 100}%`;
      handles[i].style.top = `${(c.y / s.height) * 100}%`;
    });
    poly.setAttribute('points', state.corners.map((c) => `${c.x},${c.y}`).join(' '));
  }
  place();

  card.querySelector('[data-a=rot]').onclick = () => {
    state.source = rotate90(state.source, true);
    state.corners = insetCorners(state.source);
    refresh();
  };
  card.querySelector('[data-a=snap]').onclick = (e) => {
    state.cropSnap = !state.cropSnap;
    e.currentTarget.setAttribute('aria-pressed', String(state.cropSnap));
  };
  card.querySelector('[data-a=ok]').onclick = async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Traitement…';
    await new Promise((r) => setTimeout(r, 30));
    try { validateCrop(); } catch { toast('Recadrage impossible : repères mal placés.'); refresh(); }
  };
}

function computeBase() {
  const { width: w, height: h, data } = state.warped;
  const m = inkMask(data, w, h, { darkness: state.darkness });
  // Specks smaller than ~1/100000 of the plan are dust; small room-name letters stay.
  const clean = removeSpecks(m, w, h, Math.round((w * h) / 100000));
  state.base = state.straight ? straighten(clean, w, h).mask : clean;
  bump();
}

function validateCrop() {
  const { width: w, height: h } = outputSize(state.corners, MAX_WARP);
  state.warped = warp(state.source, state.corners, w, h);
  state.planW = w; state.planH = h;
  state.edits = new Uint8Array(w * h);
  state.undo = [];
  state.tool = null;
  state.overlay = false;
  computeBase();
  state.step = 'clean';
  refresh();
}

// ---------- clean ----------

// Clockwise 90 degree rotation of a w*h single-channel array.
function rotateMask(m, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = m[y * w + x];
  return out;
}

function rotateClean() {
  const { planW: w, planH: h, source } = state;
  const [tl, tr, br, bl] = state.corners;
  const rot = (c) => ({ x: source.height - c.y, y: c.x });
  state.corners = [bl, tl, tr, br].map(rot);
  state.source = rotate90(source, true);
  state.warped = rotate90(state.warped, true);
  state.base = rotateMask(state.base, w, h);
  state.edits = rotateMask(state.edits, w, h);
  for (const m of state.markers) [m.x, m.y] = [1 - m.y, m.x];
  state.planW = h; state.planH = w;
  state.undo = [];
  bump();
  refresh();
}

function cleanView(left, right) {
  const { planW: w, planH: h } = state;
  const card = el('section', 'card');
  const tb = (a, ic, label, pressed) =>
    `<button class="tool" data-a="${a}"${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${icon(ic)}${label}</button>`;
  card.innerHTML = `<div class="plan"><div class="stage paper-bg"><canvas width="${w}" height="${h}"></canvas></div></div>
    <div class="tools">
      ${tb('crop', 'crop', 'Recadrer')}
      ${tb('rot', 'rotate', 'Pivoter')}
      ${tb('contrast', 'contrast', 'Contraste', state.tool === 'contrast')}
      ${tb('straight', 'straight', 'Murs droits', state.straight)}
      ${tb('erase', 'erase', 'Gomme', state.tool === 'erase')}
      ${tb('draw', 'edit', 'Crayon', state.tool === 'draw')}
      ${tb('undo', 'undo', 'Annuler')}
      ${tb('photo', 'eye', 'Superposer la photo', state.overlay)}
    </div>
    <div class="panel" hidden></div>
    <div class="panel overlay-panel" hidden></div>`;
  left.append(card);

  const canvas = card.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const img = new ImageData(w, h);
  const px = new Uint32Array(img.data.buffer);
  const photo = toImageData(state.warped);
  const brush = () => state.tool === 'erase' || state.tool === 'draw';

  // Overlay: the photo faded towards white, with the kept ink in blue on top,
  // so walls the filter lost show up as dark photo lines without blue.
  const OVERLAY_INK = 0xFFE5881E; // #1E88E5 as little-endian ABGR
  function paint() {
    const { base, edits } = state;
    if (!state.overlay) {
      for (let i = 0; i < px.length; i++) {
        const e = edits[i];
        px[i] = (e === 1 || (e === 0 && base[i])) ? 0xFF000000 : 0xFFFFFFFF;
      }
    } else {
      const src = photo.data, a = state.photoAlpha;
      const d = img.data;
      for (let i = 0; i < px.length; i++) {
        const e = edits[i];
        if (e === 1 || (e === 0 && base[i])) { px[i] = OVERLAY_INK; continue; }
        const o = i * 4;
        d[o] = 255 - (255 - src[o]) * a;
        d[o + 1] = 255 - (255 - src[o + 1]) * a;
        d[o + 2] = 255 - (255 - src[o + 2]) * a;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  paint();

  const undoBtn = card.querySelector('[data-a=undo]');
  const syncUndo = () => { undoBtn.disabled = !state.undo.length; };
  syncUndo();
  canvas.style.touchAction = brush() ? 'none' : 'auto';
  if (brush()) canvas.classList.add('brush');

  // Overlay slider, shown alongside any tool slider so contrast can be tuned while comparing.
  if (state.overlay) {
    const op = card.querySelector('.overlay-panel');
    op.hidden = false;
    op.innerHTML = `<label>Opacité<input type="range" min="0.1" max="1" step="0.05" value="${state.photoAlpha}" aria-label="Opacité de la photo"></label>
      <p class="hint legend-line"><span class="ink-dot"></span>En bleu : ce qui sera gardé sur le plan.</p>`;
    op.querySelector('input').oninput = (e) => { state.photoAlpha = +e.target.value; schedule(); };
  }

  // Panel with the slider of the active tool.
  const panel = card.querySelector('.panel');
  let timer = 0;
  if (state.tool === 'contrast') {
    panel.hidden = false;
    panel.innerHTML = `<label>Contraste<span class="cap">Clair</span><input type="range" min="0.45" max="0.95" step="0.01" value="${state.darkness}"><span class="cap">Foncé</span></label>`;
    panel.querySelector('input').oninput = (e) => {
      state.darkness = +e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => { computeBase(); paint(); }, 150);
    };
  } else if (brush()) {
    panel.hidden = false;
    panel.innerHTML = `<label>Taille<span class="cap">Fin</span><input type="range" min="0.005" max="0.08" step="0.001" value="${state.brush}"><span class="cap">Large</span></label>`;
    panel.querySelector('input').oninput = (e) => {
      state.brush = +e.target.value;
      // While the size changes, preview the brush in the middle of the plan.
      const r = canvas.getBoundingClientRect();
      showCursor(r.left + r.width / 2, r.top + r.height / 2);
    };
  }

  // Brush preview: a circle of the real brush size that follows the pointer.
  const cursor = el('div', 'brush-cursor');
  cursor.hidden = true;
  card.querySelector('.stage').append(cursor);
  function showCursor(clientX, clientY) {
    if (!brush()) return;
    const r = canvas.getBoundingClientRect();
    const d = state.brush * r.width;
    const sr = cursor.parentElement.getBoundingClientRect();
    Object.assign(cursor.style, { width: `${d}px`, height: `${d}px`, left: `${clientX - sr.left}px`, top: `${clientY - sr.top}px` });
    cursor.hidden = false;
  }
  if (brush()) {
    canvas.addEventListener('pointermove', (e) => showCursor(e.clientX, e.clientY));
    canvas.addEventListener('pointerdown', (e) => showCursor(e.clientX, e.clientY));
    canvas.addEventListener('pointerleave', () => { cursor.hidden = true; });
  }

  // Brush strokes go to the edits layer so a contrast change never loses them.
  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  function stamp(a, b) {
    const val = state.tool === 'erase' ? 2 : 1;
    const r = Math.max(1, (state.brush * w) / 2);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(dist / Math.max(1, r / 2)));
    for (let k = 0; k <= n; k++) {
      const cx = a.x + ((b.x - a.x) * k) / n, cy = a.y + ((b.y - a.y) * k) / n;
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) state.edits[y * w + x] = val;
      }
    }
    bump();
  }
  let last = null;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; paint(); });
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!brush()) return;
    canvas.setPointerCapture(e.pointerId);
    state.undo.push(state.edits.slice());
    if (state.undo.length > MAX_UNDO) state.undo.shift();
    last = pt(e);
    stamp(last, last);
    schedule();
    syncUndo();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = pt(e);
    stamp(last, p);
    last = p;
    schedule();
  });
  const end = () => { last = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const act = {
    crop: () => { state.step = 'crop'; refresh(); },
    rot: rotateClean,
    contrast: () => { state.tool = state.tool === 'contrast' ? null : 'contrast'; refresh(); },
    erase: () => { state.tool = state.tool === 'erase' ? null : 'erase'; refresh(); },
    draw: () => { state.tool = state.tool === 'draw' ? null : 'draw'; refresh(); },
    undo: () => {
      if (!state.undo.length) return;
      state.edits = state.undo.pop();
      bump(); paint(); syncUndo();
    },
    photo: () => { state.overlay = !state.overlay; refresh(); },
    straight: () => { state.straight = !state.straight; computeBase(); refresh(); },
  };
  card.querySelectorAll('.tool').forEach((b) => { b.onclick = act[b.dataset.a]; });

  const side = el('section', 'card');
  side.innerHTML = `<h2 class="section">Plan nettoyé</h2>
    <p class="hint">Effacez les traces restantes, redessinez les murs manquants, puis placez les postes.</p>
    <div class="actions">
      <button class="btn" data-a="go">${icon('place')}Placer les postes</button>
      <button class="btn flat" data-a="new">Nouveau plan</button>
    </div>`;
  side.querySelector('[data-a=go]').onclick = () => { location.hash = '#postes'; };
  side.querySelector('[data-a=new]').onclick = () => {
    if (state.markers.length && !confirm('Les postes placés seront perdus. Continuer ?')) return;
    resetPlan();
    refresh();
  };
  right.append(side);
}
