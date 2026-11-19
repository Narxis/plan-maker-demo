// Crop corners are [TL, TR, BR, BL]. When an edge from the dragged corner is within SNAP_DEG of
// horizontal or vertical, the corner lines up with its neighbour so that edge is exactly
// straight, giving right angles. Steeper edges (a photo taken at an angle) stay free.
export const SNAP_DEG = 2;
const H_NEIGHBOUR = [1, 0, 3, 2];
const V_NEIGHBOUR = [3, 2, 1, 0];

export function snapCorner(corners, i, p) {
  const t = Math.tan((SNAP_DEG * Math.PI) / 180);
  const h = corners[H_NEIGHBOUR[i]], v = corners[V_NEIGHBOUR[i]];
  const out = { ...p };
  if (Math.abs(p.y - h.y) <= t * Math.abs(p.x - h.x)) out.y = h.y;
  if (Math.abs(p.x - v.x) <= t * Math.abs(p.y - v.y)) out.x = v.x;
  return out;
}
