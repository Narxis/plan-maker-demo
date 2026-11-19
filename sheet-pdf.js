// Draws the A4 landscape sheet on a canvas (same layout as the printed sheet in export.js)
// and saves it as a one-page PDF, without the browser's print dialog.
import { state, TYPES, getPlanURL, countByType, sheetBox } from './state.js';
import { markerSvg } from './markers.js';
import { jpegToPdf } from './pdf.js';

const PX = 8; // canvas pixels per millimetre (about 200 dpi)
const FONT = 'Roboto, Arial, sans-serif';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
const svgImage = (svg) => loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));

// Splits text into lines that fit `width` (canvas units) with the current font.
function wrap(g, text, width) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width <= width || !line) line = next;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

// rows: [[label, value], ...] for the title block.
export async function sheetCanvas(rows) {
  const W = 297, H = 210;
  const c = document.createElement('canvas');
  c.width = W * PX; c.height = H * PX;
  const g = c.getContext('2d');
  g.scale(PX, PX);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineWidth = 0.3; g.textBaseline = 'top';

  // Sheet frame: 8 mm margins, 3 mm padding, plan on the left, 80 mm column on the right.
  const x0 = 8, y0 = 8, sw = 281, sh = 193, pad = 3, side = 80, gap = 4;
  g.strokeRect(x0, y0, sw, sh);
  const px = x0 + pad, py = y0 + pad, pw = sw - 2 * pad - gap - side, ph = sh - 2 * pad;
  g.strokeRect(px, py, pw, ph);

  // Plan, then stations on top. The plan PNG is drawn directly: Safari/iOS does not render a
  // raster <image> nested inside an SVG that is itself drawn as an image.
  // Only the part holding the plan and its stations, centred and enlarged (see sheetBox).
  const { planW: w, planH: h } = state;
  const S = w * 0.04;
  const b = sheetBox(S);
  const k = Math.min((pw - 1) / b.w, (ph - 1) / b.h);
  const dx = px + (pw - b.w * k) / 2, dy = py + (ph - b.h * k) / 2;
  g.drawImage(await loadImage(getPlanURL()), b.x, b.y, b.w, b.h, dx, dy, b.w * k, b.h * k);
  if (state.markers.length) {
    const marks = await svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${b.w}" height="${b.h}">` +
      state.markers.map((m) => markerSvg(m.type, m.n, m.x * w, m.y * h, S)).join('') + '</svg>');
    g.drawImage(marks, dx, dy, b.w * k, b.h * k);
  }

  // Right column.
  const sx = px + pw + gap;
  let y = py;
  g.font = `700 5px ${FONT}`;
  g.fillText('PLAN DE SANITATION', sx, y);
  y += 6.5;
  g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + side, y); g.stroke();
  y += 3;

  const lw = 26, lh = 4.2;
  for (const [label, value] of rows) {
    g.font = `3.3px ${FONT}`;
    const lines = wrap(g, value || '', side - lw - 3);
    const rh = lines.length * lh + 2;
    g.strokeRect(sx, y, lw, rh);
    g.strokeRect(sx + lw, y, side - lw, rh);
    lines.forEach((l, i) => g.fillText(l, sx + lw + 1.5, y + 1 + i * lh));
    g.font = `700 3.3px ${FONT}`;
    g.fillText(label, sx + 1.5, y + 1);
    y += rh;
  }

  const counts = countByType();
  const used = TYPES.filter((t) => counts[t.id]);
  if (used.length) {
    y += 4;
    g.font = `700 3.3px ${FONT}`;
    g.fillText('Légende', sx, y);
    y += 5;
    for (const t of used) {
      const sw6 = await svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-26 -26 52 52" width="52" height="52">${markerSvg(t.id, '', 0, 0, 40)}</svg>`);
      g.drawImage(sw6, sx, y, 6, 6);
      g.font = `3.3px ${FONT}`;
      g.fillText(t.label, sx + 8, y + 1.4);
      g.font = `700 3.3px ${FONT}`;
      g.textAlign = 'right';
      g.fillText(String(counts[t.id]), sx + side, y + 1.4);
      g.textAlign = 'left';
      y += 7;
    }
  }

  // Signature box, at the bottom of the column.
  g.font = `700 3.3px ${FONT}`;
  const title = wrap(g, 'Date et signature du responsable des lieux', side - 4);
  const boxH = 2 + title.length * lh + 1.5 + lh + 35 + 2;
  const by = py + ph - boxH;
  g.strokeRect(sx, by, side, boxH);
  title.forEach((l, i) => g.fillText(l, sx + 2, by + 2 + i * lh));
  g.font = `3.3px ${FONT}`;
  g.fillText('Nom :', sx + 2, by + 2 + title.length * lh + 1.5);
  return c;
}

export async function savePdf(rows, fileName) {
  const c = await sheetCanvas(rows);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const pdf = new Blob([jpegToPdf(jpeg, c.width, c.height)], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(pdf);
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
