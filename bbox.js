// Area of the plan that holds something: the ink plus the stations, with a margin.
// Used to centre and enlarge the plan on the sheet when parts around it were erased.
// A few stray specks near the edges are ignored: up to `trim` of the ink is dropped
// from each side before taking the box.

export function inkBox(mask, w, h, trim = 0.002) {
  const cols = new Uint32Array(w), rows = new Uint32Array(h);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      cols[x]++; rows[y]++; total++;
    }
  }
  if (!total) return null;
  const cut = total * trim;
  const lo = (a) => { let s = 0, i = 0; while (i < a.length - 1 && s + a[i] <= cut) s += a[i++]; return i; };
  const hi = (a) => { let s = 0, i = a.length - 1; while (i > 0 && s + a[i] <= cut) s += a[i--]; return i; };
  return { x0: lo(cols), y0: lo(rows), x1: hi(cols) + 1, y1: hi(rows) + 1 };
}

// points: station centres in plan pixels; r: half the station size.
export function contentBox(mask, w, h, points = [], r = 0, pad = 0.03) {
  return expandBox(inkBox(mask, w, h), w, h, points, r, pad);
}

// Grows an ink box (or null) to hold the stations, adds the margin, clamps to the plan.
export function expandBox(ink, w, h, points = [], r = 0, pad = 0.03) {
  const box = ink ? { ...ink } : (points.length ? { x0: w, y0: h, x1: 0, y1: 0 } : null);
  if (!box) return { x: 0, y: 0, w, h };
  for (const p of points) {
    box.x0 = Math.min(box.x0, p.x - r); box.y0 = Math.min(box.y0, p.y - r);
    box.x1 = Math.max(box.x1, p.x + r); box.y1 = Math.max(box.y1, p.y + r);
  }
  const m = pad * Math.max(box.x1 - box.x0, box.y1 - box.y0);
  const x0 = Math.max(0, Math.floor(box.x0 - m)), y0 = Math.max(0, Math.floor(box.y0 - m));
  const x1 = Math.min(w, Math.ceil(box.x1 + m)), y1 = Math.min(h, Math.ceil(box.y1 + m));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
