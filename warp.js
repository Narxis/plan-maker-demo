// Perspective correction on plain {data, width, height} RGBA objects (no DOM, runs in node).

// 3x3 matrix (flat, row-major) mapping 4 src points to 4 dst points.
export function homography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the augmented 8x9 matrix.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error('Degenerate corners');
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  h.push(1);
  return h;
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// corners: top-left, top-right, bottom-right, bottom-left.
export function outputSize(corners, maxSide = 1600) {
  const [tl, tr, br, bl] = corners;
  let w = (dist(tl, tr) + dist(bl, br)) / 2;
  let h = (dist(tl, bl) + dist(tr, br)) / 2;
  const s = Math.min(1, maxSide / Math.max(w, h));
  w *= s; h *= s;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

// Output pixel (u,v) samples the source quadrilateral; bilinear; outside = opaque white.
export function warp(src, corners, outW, outH) {
  const rect = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
  const H = homography(rect, corners);
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { data, width: sw, height: sh } = src;
  const eps = 1e-6;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const o = (v * outW + u) * 4;
      // Pixel centres: continuous source coordinate minus 0.5 gives the pixel index space.
      const p = applyHomography(H, u + 0.5, v + 0.5);
      const sx = p.x - 0.5, sy = p.y - 0.5;
      if (!(sx >= -0.5 - eps && sx <= sw - 0.5 + eps && sy >= -0.5 - eps && sy <= sh - 0.5 + eps)) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      const xa = Math.min(sw - 1, Math.max(0, x0)), xb = Math.min(sw - 1, Math.max(0, x0 + 1));
      const ya = Math.min(sh - 1, Math.max(0, y0)), yb = Math.min(sh - 1, Math.max(0, y0 + 1));
      for (let c = 0; c < 4; c++) {
        const top = data[(ya * sw + xa) * 4 + c] * (1 - fx) + data[(ya * sw + xb) * 4 + c] * fx;
        const bot = data[(yb * sw + xa) * 4 + c] * (1 - fx) + data[(yb * sw + xb) * 4 + c] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return { data: out, width: outW, height: outH };
}

export function rotate90(src, clockwise = true) {
  const { data, width: w, height: h } = src;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Output is h wide, w tall.
      const nx = clockwise ? h - 1 - y : y;
      const ny = clockwise ? x : w - 1 - x;
      const s = (y * w + x) * 4, d = (ny * h + nx) * 4;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
    }
  }
  return { data: out, width: h, height: w };
}
