// Station marker drawing (SVG strings), shared by the plan editor and the printed sheet.
import { esc } from './ui.js';

const FONT = 'Roboto, Arial, sans-serif';

// cx,cy = centre, s = marker width, in the units of the enclosing SVG.
// Every marker is an outline with a white inside, so the station number stays readable
// on screen and on paper (technicians may also write numbers by hand).
export function markerSvg(type, n, cx, cy, s, selected = false) {
  const sw = s * 0.08;
  const h = s * 0.86;
  const fs = s * 0.52;
  let shape;
  const txt = '#000';
  let ty = cy;
  const poly = (pts) => `<polygon points="${pts.map(([x, y]) => `${cx + x},${cy + y}`).join(' ')}" fill="#fff" stroke="#000" stroke-width="${sw}" stroke-linejoin="round"/>`;
  if (type === 'rc') {
    // Rodent capture station: square with a double border.
    const g = s * 0.14;
    shape = `<rect x="${cx - s / 2}" y="${cy - h / 2}" width="${s}" height="${h}" fill="#fff" stroke="#000" stroke-width="${sw}"/>` +
      `<rect x="${cx - s / 2 + g}" y="${cy - h / 2 + g}" width="${s - 2 * g}" height="${h - 2 * g}" fill="none" stroke="#000" stroke-width="${sw * 0.7}"/>`;
  } else if (type === 'ramp') {
    shape = `<circle cx="${cx}" cy="${cy}" r="${s / 2}" fill="#fff" stroke="#000" stroke-width="${sw}"/>`;
  } else if (type === 'gel') {
    const t = s * 0.66;
    shape = poly([[0, -t * 0.95], [t, t * 0.72], [-t, t * 0.72]]);
    ty = cy + s * 0.14;
  } else if (type === 'deiv') {
    // Hexagon.
    const r = s * 0.56;
    shape = poly([0, 1, 2, 3, 4, 5].map((k) => [r * Math.cos((Math.PI / 3) * k), r * Math.sin((Math.PI / 3) * k)]));
  } else if (type === 'mites') {
    // Diamond.
    const r = s * 0.66;
    shape = poly([[0, -r], [r, 0], [0, r], [-r, 0]]);
  } else {
    shape = `<rect x="${cx - s / 2}" y="${cy - h / 2}" width="${s}" height="${h}" fill="#fff" stroke="#000" stroke-width="${sw}"/>`;
  }
  const ring = selected
    ? `<circle cx="${cx}" cy="${cy}" r="${s * 0.78}" fill="none" stroke="#26A69A" stroke-width="${s * 0.1}"/>`
    : '';
  const label = n === '' ? '' :
    `<text x="${cx}" y="${ty}" dy=".35em" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${fs}" fill="${txt}">${esc(n)}</text>`;
  return ring + shape + label;
}

export const swatch = (type) =>
  `<svg class="swatch" viewBox="-26 -26 52 52" aria-hidden="true">${markerSvg(type, '', 0, 0, 40)}</svg>`;
