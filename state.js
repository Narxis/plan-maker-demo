// In-memory app state shared by the tabs, plus the plan raster helpers.
import { maskToImageData } from './filter.js';

export const TYPES = [
  { id: 'rc', label: 'Rongeur poste à capture' },
  { id: 'rcons', label: 'Rongeur poste à consommation' },
  { id: 'ramp', label: 'Rampant poste à capture' },
  { id: 'gel', label: 'Point de gel' },
  { id: 'deiv', label: 'DEIV' },
  { id: 'mites', label: 'Piège à mites' },
];
export const typeLabel = (id) => (TYPES.find((t) => t.id === id) || TYPES[0]).label;

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const state = {
  step: 'empty',      // empty | crop | clean
  source: null,       // {data,width,height} downscaled photo
  corners: null,      // [TL,TR,BR,BL] in source pixels
  warped: null,       // cropped photo
  base: null,         // Uint8Array ink mask from the filter (1 = ink)
  edits: null,        // Uint8Array: 0 untouched, 1 drawn ink, 2 erased
  undo: [],
  darkness: 0.62,
  straight: true,
  cropSnap: false,
  brush: 0.02,        // brush diameter as a share of the plan width
  tool: null,         // null | contrast | erase | draw
  overlay: false, photoAlpha: 0.6,
  planW: 0,
  planH: 0,
  version: 0,         // bumped whenever the final mask changes
  markers: [],        // {id,n,type,x,y,loc} with x,y normalised 0-1
  nextId: 1,
  selectedType: 'rc',
  editing: null,      // marker id open in the editor
  cartouche: { client: '', adresse: '', niveau: '', technicien: '', date: today() },
};

export const bump = () => { state.version++; };

// Forget the current plan and its markers (new photo loaded).
export function resetPlan() {
  Object.assign(state, {
    step: 'empty', source: null, corners: null, warped: null, base: null, edits: null,
    undo: [], tool: null, overlay: false, planW: 0, planH: 0, markers: [], editing: null,
  });
  bump();
}

let cache = { version: -1, url: '' };
// Final mask drawn as a black-on-white PNG data URL (cached per version).
export function getPlanURL() {
  if (!state.base) return '';
  if (cache.version === state.version) return cache.url;
  const { planW: w, planH: h, base, edits } = state;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = edits[i] === 1 ? 1 : edits[i] === 2 ? 0 : base[i];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(maskToImageData(mask, w, h), 0, 0);
  cache = { version: state.version, url: c.toDataURL('image/png') };
  return cache.url;
}

export const countByType = () => {
  const c = Object.fromEntries(TYPES.map((t) => [t.id, 0]));
  for (const m of state.markers) c[m.type]++;
  return c;
};
