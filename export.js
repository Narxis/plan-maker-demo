// EXPORT tab: title block form and the A4 landscape sheet (printed as PDF).
import { state, TYPES, getPlanURL, countByType } from './state.js';
import { markerSvg, swatch } from './markers.js';
import { el, icon, esc } from './ui.js';

const FIELDS = [
  ['client', 'Client'], ['adresse', 'Adresse'], ['niveau', 'Niveau'], ['technicien', 'Technicien'],
];

const fmtDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');

let observer = null;

function sheetHtml() {
  const { planW: w, planH: h, cartouche: c } = state;
  const S = w * 0.04;
  const counts = countByType();
  const rows = [...FIELDS.map(([k, l]) => [l, c[k]]), ['Date de visite', fmtDate(c.date)], ['Remarques', c.remarques]];
  return `<div class="paper-plan"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      <image href="${getPlanURL()}" x="0" y="0" width="${w}" height="${h}"/>
      ${state.markers.map((m) => markerSvg(m.type, m.n, m.x * w, m.y * h, S)).join('')}
    </svg></div>
    <div class="paper-side">
      <h2>PLAN DE SANITATION</h2>
      <table class="block">${rows.map(([l, v]) => `<tr><th>${l}</th><td>${esc(v)}</td></tr>`).join('')}</table>
      <div class="legend"><h3>Légende</h3>${TYPES.filter((t) => counts[t.id]).map((t) =>
        `<div>${swatch(t.id)}<span>${t.label}</span><b>${counts[t.id]}</b></div>`).join('')}</div>
      <div class="sign"><p>Date et signature du responsable des lieux</p><p class="name">Nom :</p><div class="area"></div></div>
    </div>`;
}

export function renderExport(main) {
  observer?.disconnect();
  main.replaceChildren();
  const left = el('div', 'col');
  const right = el('div', 'col');
  main.append(left, right);

  if (!state.base) {
    const c = el('section', 'card', `<h2 class="section">Export</h2>
      <p class="hint">Chargez et nettoyez un plan avant d'exporter.</p>
      <div class="actions"><button class="btn">${icon('photo')}Aller au plan</button></div>`);
    c.querySelector('button').onclick = () => { location.hash = '#plan'; };
    left.append(c);
    return;
  }

  const prev = el('section', 'card preview', `<div class="paper-wrap"><div class="paper"></div></div>`);
  left.append(prev);
  const wrap = prev.querySelector('.paper-wrap');
  const paper = prev.querySelector('.paper');
  const draw = () => { paper.innerHTML = sheetHtml(); };
  draw();

  // The sheet has a fixed physical size; scale it down to the available width.
  const fit = () => { paper.style.transform = `scale(${wrap.clientWidth / paper.offsetWidth})`; };
  observer = new ResizeObserver(fit);
  observer.observe(wrap);
  fit();

  const c = state.cartouche;
  const form = el('section', 'card', `<h2 class="section">Cartouche</h2><div class="form">
      ${FIELDS.map(([k, l]) => `<label>${l}<input type="text" name="${k}" value="${esc(c[k])}"></label>`).join('')}
      <label>Date de visite<input type="date" name="date" value="${esc(c.date)}"></label>
      <label>Remarques<textarea name="remarques" rows="3">${esc(c.remarques)}</textarea></label>
    </div>
    <div class="actions"><button class="btn">${icon('print')}Imprimer / PDF</button></div>`);
  form.oninput = (e) => {
    if (!e.target.name) return;
    c[e.target.name] = e.target.value;
    draw();
  };
  form.querySelector('button').onclick = () => window.print();
  right.append(form);
}
