// EXPORT tab: title block form and the A4 landscape sheet (printed as PDF).
import { state, TYPES, getPlanURL, countByType, sheetBox } from './state.js';
import { markerSvg, swatch } from './markers.js';
import { el, icon, esc, toast } from './ui.js';
import { savePdf } from './sheet-pdf.js';

const FIELDS = [
  ['client', 'Client'], ['adresse', 'Adresse'], ['niveau', 'Niveau'], ['technicien', 'Technicien'],
];

const fmtDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');

let observer = null;

const sheetRows = (c) => [...FIELDS.map(([k, l]) => [l, c[k]]), ['Date de visite', fmtDate(c.date)]];

// "Plan-sanitation_Restaurant-Exemple_2026-11-19.pdf"
const pdfName = (c) => {
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return ['Plan-sanitation', slug(c.client || ''), c.date].filter(Boolean).join('_') + '.pdf';
};

function sheetHtml() {
  const { planW: w, planH: h, cartouche: c } = state;
  const S = w * 0.04;
  const counts = countByType();
  const rows = sheetRows(c);
  const b = sheetBox(S);
  return `<div class="paper-plan"><svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet">
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
    </div>
    <div class="actions">
      <button class="btn" data-a="pdf">${icon('download')}Enregistrer en PDF</button>
      <button class="btn flat" data-a="print">${icon('print')}Imprimer</button>
    </div>`);
  form.oninput = (e) => {
    if (!e.target.name) return;
    c[e.target.name] = e.target.value;
    draw();
  };
  form.querySelector('[data-a=print]').onclick = () => window.print();
  form.querySelector('[data-a=pdf]').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await savePdf(sheetRows(c), pdfName(c)); } catch { toast("Impossible de créer le PDF."); }
    b.disabled = false;
  };
  right.append(form);
}
