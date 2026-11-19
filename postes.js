// POSTES tab: place, move and edit station markers on the cleaned plan.
import { state, TYPES, typeLabel, getPlanURL, countByType } from './state.js';
import { markerSvg, swatch } from './markers.js';
import { el, icon, esc, clamp } from './ui.js';

const chev = icon('chev');

export function renderPostes(main) {
  main.replaceChildren();
  const left = el('div', 'col');
  const right = el('div', 'col');
  main.append(left, right);

  if (!state.base) {
    const c = el('section', 'card', `<h2 class="section">Postes</h2>
      <p class="hint">Chargez et nettoyez un plan avant de placer des postes.</p>
      <div class="actions"><button class="btn">${icon('photo')}Aller au plan</button></div>`);
    c.querySelector('button').onclick = () => { location.hash = '#plan'; };
    left.append(c);
    return;
  }

  const { planW: w, planH: h } = state;
  const S = w * 0.04; // marker width in plan pixels
  const plan = el('section', 'card', `<div class="plan"><div class="stage paper-bg">
      <img alt="Plan nettoyé" src="${getPlanURL()}" draggable="false">
      <svg class="overlay" viewBox="0 0 ${w} ${h}"></svg></div></div>
      <p class="hint">Touchez le plan pour placer un poste, glissez un poste pour le déplacer.</p>`);
  left.append(plan);
  const ov = plan.querySelector('svg');

  const typeCard = el('section', 'card');
  const recentCard = el('section', 'card');
  const editor = el('section', 'card editor');
  // Editor first: on PC it must be in view as soon as a station is tapped.
  right.append(editor, typeCard, recentCard);

  const find = (id) => state.markers.find((m) => m.id === id);

  function drawMarkers() {
    ov.innerHTML = state.markers.map((m) => markerSvg(m.type, m.n, m.x * w, m.y * h, S, m.id === state.editing)).join('');
  }

  function drawLists() {
    const counts = countByType();
    typeCard.innerHTML = `<h2 class="section">Type de poste</h2><div role="radiogroup">` +
      TYPES.map((t) => `<button class="row pick" role="radio" aria-checked="${t.id === state.selectedType}" data-type="${t.id}">
        ${swatch(t.id)}<span class="label">${t.label}</span><span class="value">${counts[t.id]}</span></button>`).join('') + `</div>`;
    const last = state.markers.slice(-6).reverse();
    recentCard.innerHTML = `<h2 class="section">Derniers postes placés</h2>` + (last.length
      ? last.map((m) => `<button class="row" data-open="${m.id}"><span class="label">${m.n}${m.loc ? ' - ' + esc(m.loc) : ''}<span class="sub">${typeLabel(m.type)}</span></span>${chev}</button>`).join('')
      : `<p class="hint">Aucun poste placé.</p>`);
  }

  function drawEditor() {
    const m = find(state.editing);
    editor.hidden = !m;
    if (!m) return;
    editor.innerHTML = `<h2 class="section">Poste ${m.n}</h2>
      <div class="form">
        <label>Numéro<input type="number" min="1" name="n" value="${m.n}" inputmode="numeric"></label>
        <label>Type<select name="type">${TYPES.map((t) => `<option value="${t.id}"${t.id === m.type ? ' selected' : ''}>${t.label}</option>`).join('')}</select></label>
        <label>Emplacement<input type="text" name="loc" value="${esc(m.loc)}" placeholder="Intérieur/Cuisine"></label>
      </div>
      <div class="actions"><button class="btn flat danger" data-a="del">${icon('delete')}Supprimer</button><button class="btn" data-a="close">${icon('check')}Fermer</button></div>`;
    editor.oninput = (e) => {
      const f = e.target.name;
      if (f === 'n') m.n = Math.max(1, parseInt(e.target.value, 10) || m.n);
      else m[f] = e.target.value;
      drawMarkers(); drawLists();
    };
    editor.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'del') state.markers = state.markers.filter((x) => x !== m);
      if (a) { state.editing = null; drawAll(); }
    };
  }

  const drawAll = () => { drawMarkers(); drawLists(); drawEditor(); };
  const open = (id) => { state.editing = id; drawAll(); };

  typeCard.onclick = (e) => {
    const b = e.target.closest('[data-type]');
    if (b) { state.selectedType = b.dataset.type; drawLists(); }
  };
  recentCard.onclick = (e) => {
    const b = e.target.closest('[data-open]');
    if (b) open(+b.dataset.open);
  };

  // One pointer handler: a tap on a marker opens it, a drag moves it, a tap elsewhere places one.
  let down = null;
  const toPlan = (e) => {
    const r = ov.getBoundingClientRect();
    return { nx: clamp((e.clientX - r.left) / r.width, 0, 1), ny: clamp((e.clientY - r.top) / r.height, 0, 1), scale: r.width / w };
  };
  ov.addEventListener('pointerdown', (e) => {
    const p = toPlan(e);
    const reach = Math.max(S * 0.6, 24 / p.scale);
    let hit = null, best = reach;
    for (const m of state.markers) {
      const d = Math.hypot(m.x * w - p.nx * w, m.y * h - p.ny * h);
      if (d <= best) { best = d; hit = m; }
    }
    ov.setPointerCapture(e.pointerId);
    down = { hit, sx: e.clientX, sy: e.clientY, moved: false };
    e.preventDefault();
  });
  ov.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (!down.moved && Math.hypot(e.clientX - down.sx, e.clientY - down.sy) > 6) down.moved = true;
    if (down.hit && down.moved) {
      const p = toPlan(e);
      down.hit.x = p.nx; down.hit.y = p.ny;
      drawMarkers();
    }
  });
  ov.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || d.moved) return;
    if (d.hit) { open(d.hit.id); return; }
    const p = toPlan(e);
    const n = state.markers.reduce((a, m) => Math.max(a, m.n), 0) + 1;
    state.markers.push({ id: state.nextId++, n, type: state.selectedType, x: p.nx, y: p.ny, loc: '' });
    drawAll();
  });
  ov.addEventListener('pointercancel', () => { down = null; });

  drawAll();
}
