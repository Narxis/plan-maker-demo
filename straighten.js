// Straightens walls that run along the plan's two main axes and leaves every other angle alone.
//
// 1. dominantAngle finds the plan's main orientation (0° for a normal plan, 45° for a plan drawn
//    at an angle), so "straight" means "parallel to the plan's own axes", not to the photo edges.
// 2. straighten looks for long ink runs whose angle is within `tol` degrees of one of those two
//    axes (Hough transform restricted to those angles), removes their wobbly pixels and redraws
//    them as perfectly straight bands of the same thickness. Walls further than `tol` from the
//    axes (diagonal walls, curves) and short marks (text, symbols) are never touched.
//
// Lines are written in normal form: rho = x*cos(a) + y*sin(a), `a` in degrees.

const DEG = Math.PI / 180;

function inkPoints(mask, w, h, every = 1) {
  const xs = [], ys = [];
  let k = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    if (k++ % every) continue;
    xs.push(i % w);
    ys.push((i / w) | 0);
  }
  return { xs, ys };
}

// Main orientation of the plan in [0, 90): the angle whose projections (and those of the
// perpendicular) are the most "peaky", i.e. where the most ink lies on few straight lines.
export function dominantAngle(mask, w, h) {
  const total = mask.reduce((s, v) => s + (v ? 1 : 0), 0);
  if (total < 10) return 0;
  const { xs, ys } = inkPoints(mask, w, h, Math.max(1, Math.floor(total / 40000)));
  const diag = Math.ceil(Math.hypot(w, h));
  const acc = new Int32Array(2 * diag + 1);
  const score = (a) => {
    const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
    acc.fill(0);
    for (let k = 0; k < xs.length; k++) acc[Math.round(xs[k] * c + ys[k] * s) + diag]++;
    let sum = 0;
    for (let i = 0; i < acc.length; i++) sum += acc[i] * acc[i];
    return sum;
  };
  const pair = (a) => score(a) + score(a + 90);
  let best = 0, bestS = -1;
  for (let a = 0; a < 90; a += 0.5) { const s = pair(a); if (s > bestS) { bestS = s; best = a; } }
  for (let a = best - 0.5; a <= best + 0.5; a += 0.1) { const s = pair(a); if (s > bestS) { bestS = s; best = a; } }
  const a = ((best % 90) + 90) % 90;
  // After cropping, most plans are square to the photo: within 1 degree, trust the axes.
  return a < 1 || a > 89 ? 0 : a;
}

function median(arr) {
  const a = Float64Array.from(arr).sort();
  return a.length ? a[a.length >> 1] : 0;
}

// Returns { mask, theta, lines }. The input mask is not modified.
export function straighten(mask, w, h, opts = {}) {
  const size = Math.max(w, h);
  const o = {
    tol: 2,                                        // max deviation (degrees) from a main axis
    minLen: Math.max(12, Math.round(size * 0.035)), // shorter runs are left alone
    maxGap: Math.max(3, Math.round(size * 0.005)),  // larger gaps split a wall (doors stay open)
    band: Math.max(8, Math.round(size * 0.015)),    // search half-width around a candidate line (fits thick outer walls)
    slack: 3,                                      // wobble removed on each side of the wall
    ...opts,
  };
  const theta = opts.theta ?? dominantAngle(mask, w, h);
  const out = mask.slice();
  const { xs, ys } = inkPoints(mask, w, h);
  const n = xs.length;
  const lines = [];
  if (!n) return { mask: out, theta, lines };

  const angles = [];
  for (const base of [theta, theta + 90]) {
    for (let d = -o.tol; d <= o.tol + 1e-9; d += 0.25) angles.push({ base, a: base + d });
  }
  const diag = Math.ceil(Math.hypot(w, h));
  const R = 2 * diag + 1;
  const cs = angles.map((A) => Math.cos(A.a * DEG));
  const sn = angles.map((A) => Math.sin(A.a * DEG));
  const acc = new Int32Array(angles.length * R);
  const vote = (k, v) => {
    for (let j = 0; j < angles.length; j++) acc[j * R + Math.round(xs[k] * cs[j] + ys[k] * sn[j]) + diag] += v;
  };
  for (let k = 0; k < n; k++) vote(k, 1);
  const alive = new Uint8Array(n).fill(1);

  // Pixels grouped by rho for one candidate angle (counting sort), built on first use.
  const cache = new Map();
  const buckets = (j) => {
    if (cache.has(j)) return cache.get(j);
    const start = new Int32Array(R + 1);
    const bin = new Int32Array(n);
    for (let k = 0; k < n; k++) { bin[k] = Math.round(xs[k] * cs[j] + ys[k] * sn[j]) + diag; start[bin[k] + 1]++; }
    for (let i = 0; i < R; i++) start[i + 1] += start[i];
    const fill = start.slice(0, R);
    const items = new Int32Array(n);
    for (let k = 0; k < n; k++) items[fill[bin[k]]++] = k;
    const b = { start, items };
    cache.set(j, b);
    return b;
  };

  // Candidate lines: local maxima of the accumulator, strongest first, in a single pass.
  // Votes of removed walls are subtracted as we go, so a weakened candidate is skipped.
  const A = angles.length;
  const peaks = [];
  for (let j = 0; j < A; j++) {
    for (let p = 1; p < R - 1; p++) {
      const i = j * R + p, v = acc[i];
      if (v < o.minLen || v < acc[i - 1] || v < acc[i + 1]) continue;
      if ((j > 0 && v < acc[i - R]) || (j < A - 1 && v < acc[i + R])) continue;
      peaks.push(i);
    }
  }
  peaks.sort((p, q) => acc[q] - acc[p]);

  for (const bi of peaks) {
    if (acc[bi] < o.minLen) continue;
    const j = (bi / R) | 0;
    const rho = (bi % R) - diag;
    const c = cs[j], s = sn[j];

    // Pixels near the candidate line, with their position along it (u) and across it (r).
    const { start: bs, items } = buckets(j);
    const lo = Math.max(0, rho + diag - o.band - 1), hi = Math.min(R - 1, rho + diag + o.band + 1);
    const near = [];
    for (let q = bs[lo]; q < bs[hi + 1]; q++) {
      const k = items[q];
      if (!alive[k]) continue;
      const r = xs[k] * c + ys[k] * s - rho;
      if (r < -o.band || r > o.band) continue;
      near.push({ k, u: -xs[k] * s + ys[k] * c, r });
    }
    near.sort((p, q) => p.u - q.u);

    let start = 0;
    for (let i = 1; i <= near.length; i++) {
      if (i < near.length && near[i].u - near[i - 1].u <= o.maxGap) continue;
      const run = near.slice(start, i);
      start = i;
      if (!run.length || run[run.length - 1].u - run[0].u < o.minLen) continue;

      // Thickness = median pixel count per unit of length; centre = median offset.
      const center = median(run.map((p) => p.r));
      const perU = new Map();
      for (const p of run) {
        if (Math.abs(p.r - center) > o.band) continue;
        const key = Math.round(p.u);
        perU.set(key, (perU.get(key) || 0) + 1);
      }
      const t = Math.max(1, median([...perU.values()]));
      // Ink filling the whole search window: the edges can't be seen, so this is a filled area.
      if (t >= 2 * o.band - 2) continue;
      const core = run.filter((p) => Math.abs(p.r - center) <= t / 2 + o.slack);
      if (core.length < 2) continue;
      const u0 = core[0].u, u1 = core[core.length - 1].u;
      const len = u1 - u0;
      // A wall is long and continuous: most positions along it carry ink.
      const covered = new Set(core.map((p) => Math.round(p.u))).size;
      if (len < o.minLen || covered < 0.7 * len) continue;
      // The run itself must follow the candidate line: a diagonal wall crossing the search band
      // also gives a long run, but its offset drifts steadily along it.
      let mu = 0, mr = 0;
      for (const p of core) { mu += p.u; mr += p.r; }
      mu /= core.length; mr /= core.length;
      let cov = 0, vu = 0;
      for (const p of core) { cov += (p.u - mu) * (p.r - mr); vu += (p.u - mu) ** 2; }
      const slope = vu > 0 ? cov / vu : 0;
      if (Math.abs(slope) > Math.tan(1 * DEG)) continue;
      const fit = (u) => mr + slope * (u - mu);

      // Wobble: how far the wall's pixels stray from the fitted line. All of them are removed,
      // so no ragged edge is left next to the redrawn wall.
      const res = core.map((p) => Math.abs(p.r - fit(p.u))).sort((a, b) => a - b);
      const wobble = res[Math.floor(res.length * 0.95)];
      const half = Math.min(o.band, Math.max(t / 2 + o.slack, wobble + 1));

      // Walls have paper on both sides. Inside a filled area (logo, hatching, dark room) any
      // direction looks like a line: reject runs with ink on both sides along much of their length.
      let both = 0, probes = 0;
      const inkAt = (rr, u) => {
        const x = Math.round(rr * c - u * s), y = Math.round(rr * s + u * c);
        return x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
      };
      // Probe beyond the wall's own fuzzy, wobbly edge.
      const side = Math.max(t / 2 + o.slack, half) + 3;
      // Text: letters cross the line every few pixels. Walls are crossed rarely (other walls).
      let crossings = 0, prev = false;
      for (let u = u0; u <= u1; u += 1) {
        const rr = rho + fit(u);
        const a = inkAt(rr - side, u), b = inkAt(rr + side, u);
        if (a && b) both++;
        probes++;
        const now = a || b;
        if (now && !prev) crossings++;
        prev = now;
      }
      if (both > 0.3 * probes) continue;
      if (crossings >= 4 && crossings > len / 25) continue;

      // A wall is solid: about as many ink pixels across it everywhere along its length.
      // Text read as a line (a bold word, or the tops of a row of letters) has thin spots
      // between and inside the letters.
      {
        const across = new Map();
        for (const p of core) {
          if (Math.abs(p.r - fit(p.u)) > t / 2 + 1) continue;
          const key = Math.round(p.u);
          across.set(key, (across.get(key) || 0) + 1);
        }
        let thin = 0;
        for (let u = Math.round(u0); u <= Math.round(u1); u++) if ((across.get(u) || 0) < 0.5 * t) thin++;
        if (thin > 0.15 * (len + 1)) continue;
      }

      // Pixels of a crossing stroke (the side of a box, a wall meeting this one) continue past
      // the band: keep them, only the wall's own pixels are removed and redrawn.
      const crossing = (p) => {
        const d = p.r - fit(p.u);
        return inkAt(rho + fit(p.u) + Math.sign(d || 1) * (half + 1.5), p.u);
      };
      const wall = run.filter((p) => Math.abs(p.r - fit(p.u)) <= half && !(Math.abs(p.r - fit(p.u)) > t / 2 && crossing(p)));
      for (const p of wall) {
        out[ys[p.k] * w + xs[p.k]] = 0;
        alive[p.k] = 0;
        vote(p.k, -1);
      }
      // End points on the fitted line (offset follows the fitted slope).
      const at = (u) => {
        const rr = rho + mr + slope * (u - mu);
        return { x: rr * c - u * s, y: rr * s + u * c };
      };
      const e1 = at(u0), e2 = at(u1);
      // Exact deviation from the main axis. Snapping rotates the wall around its middle: only
      // do it when its ends move by 2 px at most, so junctions with other walls stay closed.
      // Otherwise the wall is still made straight, at its own angle.
      // A line at normal angle a+e gives offsets r = -u*sin(e) around the a-line, so e = -atan(slope).
      const deviation = angles[j].a - angles[j].base - Math.atan(slope) / DEG;
      const snap = (len / 2) * Math.abs(Math.tan(deviation * DEG)) <= 2;
      lines.push({ angle: snap ? angles[j].base : angles[j].base + deviation, deviation, snapped: snap, x1: e1.x, y1: e1.y, x2: e2.x, y2: e2.y, thickness: t });
    }
  }

  for (const L of lines) drawBand(out, w, h, L);
  return { mask: out, theta, lines };
}

// Draws a straight band of the line's thickness, perpendicular to its snapped normal angle,
// through the midpoint of the fitted segment.
function drawBand(out, w, h, L) {
  const c = Math.cos(L.angle * DEG), s = Math.sin(L.angle * DEG);
  const mx = (L.x1 + L.x2) / 2, my = (L.y1 + L.y2) / 2;
  const rho = mx * c + my * s;
  const ua = -L.x1 * s + L.y1 * c, ub = -L.x2 * s + L.y2 * c;
  const uMin = Math.min(ua, ub) - 0.5, uMax = Math.max(ua, ub) + 0.5;
  const half = L.thickness / 2;
  const pad = half + 2;
  const x0 = Math.max(0, Math.floor(Math.min(L.x1, L.x2) - pad)), x1 = Math.min(w - 1, Math.ceil(Math.max(L.x1, L.x2) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(L.y1, L.y2) - pad)), y1 = Math.min(h - 1, Math.ceil(Math.max(L.y1, L.y2) + pad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const r = x * c + y * s - rho;
      const u = -x * s + y * c;
      if (r >= -half && r < half && u >= uMin && u <= uMax) out[y * w + x] = 1;
    }
  }
}
