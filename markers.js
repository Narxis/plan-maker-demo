// Station marker drawing (SVG strings), shared by the plan editor and the printed sheet.
import { esc } from './ui.js';

const FONT = 'Roboto, Arial, sans-serif';

// cx,cy = centre, s = marker width, in the units of the enclosing SVG.
export function markerSvg(type, n, cx, cy, s, selected = false) {
  const sw = s * 0.08;
  const h = s * 0.86;
  const fs = s * 0.52;
  let shape;
  let txt = '#000';
  let ty = cy;
  if (type === 'rcons') {
    shape = `<rect x="${cx - s / 2}" y="${cy - h / 2}" width="${s}" height="${h}" fill="#000" stroke="#000" stroke-width="${sw}"/>`;
    txt = '#fff';
  } else if (type === 'ramp') {
    shape = `<circle cx="${cx}" cy="${cy}" r="${s / 2}" fill="#fff" stroke="#000" stroke-width="${sw}"/>`;
  } else if (type === 'gel') {
    const t = s * 0.62;
    shape = `<polygon points="${cx},${cy - t * 0.9} ${cx + t},${cy + t * 0.7} ${cx - t},${cy + t * 0.7}" fill="#fff" stroke="#000" stroke-width="${sw}" stroke-linejoin="round"/>`;
    ty = cy + s * 0.14;
  } else if (type === 'mep') {
    const g = s * 0.14;
    shape = `<rect x="${cx - s / 2}" y="${cy - h / 2}" width="${s}" height="${h}" fill="#fff" stroke="#000" stroke-width="${sw}"/>` +
      `<rect x="${cx - s / 2 + g}" y="${cy - h / 2 + g}" width="${s - 2 * g}" height="${h - 2 * g}" fill="none" stroke="#000" stroke-width="${sw}"/>`;
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
