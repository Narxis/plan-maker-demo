// Plan-Maker demo: tab router. State lives in state.js (memory only).
import { renderPlan } from './plan.js';
import { renderPostes } from './postes.js';
import { renderExport } from './export.js';

const TABS = { plan: renderPlan, postes: renderPostes, export: renderExport };
const main = document.getElementById('main');

function show() {
  const tab = TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'plan';
  document.querySelectorAll('nav a').forEach((a) => {
    if (a.getAttribute('href') === '#' + tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  TABS[tab](main);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', show);
show();
