// Turns a photo of an evacuation plan into a clean black-on-white floor plan.
// Steps: estimate the local paper brightness (handles glare and shadows), drop coloured
// pixels (green/red/blue/yellow pictograms and fills), keep only dark ink (walls, room names).

export const DEFAULTS = {
  darkness: 0.62,   // ink = pixel darker than this share of the local paper brightness
  saturation: 0.28, // pixels more saturated than this are pictograms or fills: removed
  keepDarkColour: 60, // coloured pixels darker than this (0-255) are kept as ink
  blurDivisor: 24,  // background blur radius = image size / this
};

// Box blur of a single channel through an integral image: O(pixels), radius-independent.
function boxBlur(src, w, h, r) {
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

// Returns a Uint8Array mask: 1 = ink (keep, black), 0 = paper (white).
export function inkMask(data, w, h, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const n = w * h;
  const lum = new Float32Array(n);
  const sat = new Float32Array(n);
  const max = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[i] = hi === 0 ? 0 : (hi - lo) / hi;
    max[i] = hi;
  }
  // Paper brightness: blur a copy where dark ink is replaced by its neighbourhood guess,
  // approximated here by blurring a max-clamped luminance so thick walls don't darken it.
  const r = Math.max(4, Math.round(Math.max(w, h) / o.blurDivisor));
  const bg = boxBlur(lum, w, h, r);
  const bg2 = new Float32Array(n);
  for (let i = 0; i < n; i++) bg2[i] = Math.max(lum[i], bg[i]);
  const paper = boxBlur(bg2, w, h, r);

  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const coloured = sat[i] > o.saturation && max[i] > o.keepDarkColour;
    if (coloured) continue;
    if (lum[i] < o.darkness * paper[i]) mask[i] = 1;
  }
  return mask;
}

// Removes connected ink blobs smaller than minArea pixels (specks, dust, pictogram leftovers).
export function removeSpecks(mask, w, h, minArea) {
  if (minArea <= 0) return mask;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const blob = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    blob.length = 0;
    while (top) {
      const p = stack[--top];
      blob.push(p);
      const x = p % w, y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[top++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[top++] = p + w; }
    }
    if (blob.length < minArea) for (const p of blob) mask[p] = 0;
  }
  return mask;
}

export function maskToImageData(mask, w, h) {
  const out = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = mask[i] ? 0 : 255;
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  return out;
}
