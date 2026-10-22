// Color Stack baseline: tries every legal placement on a copy of the board, plays out the matches and
// chains, and keeps the best by points minus a penalty for height and blocked same-color neighbors.
export const player = {
  id: "baseline-greedy",
  name: "Greedy one-move lookahead",
  kind: "baseline",
  model: null,
  harness: "tools/agents/greedy-color-stack.mjs",
  notes: "Simulates each placement with chains; current piece only, no next-piece lookahead.",
};

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function matches(b) {
  const R = b.length, C = b[0].length, hit = new Set();
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const v = b[r][c];
    if (!v) continue;
    for (const [dr, dc] of DIRS) {
      if (r - dr >= 0 && c - dc >= 0 && c - dc < C && b[r - dr][c - dc] === v) continue;   // count each run once, from its start
      const line = [];
      for (let rr = r, cc = c; rr < R && cc >= 0 && cc < C && b[rr][cc] === v; rr += dr, cc += dc) line.push(rr * C + cc);
      if (line.length >= 4) line.forEach((k) => hit.add(k));
    }
  }
  return hit;
}

function settle(b) {
  const R = b.length, C = b[0].length;
  for (let c = 0; c < C; c++) {
    const col = [];
    for (let r = R - 1; r >= 0; r--) if (b[r][c]) col.push(b[r][c]);
    for (let r = R - 1, i = 0; r >= 0; r--, i++) b[r][c] = col[i] || null;
  }
}

function simulate(board, colors, col) {
  const b = board.map((r) => r.slice());
  let land = -1;
  while (land + 1 < b.length && !b[land + 1][col]) land++;
  if (land < 2) return null;                     // the column would stick out of the top
  for (let i = 0; i < 3; i++) b[land - 2 + i][col] = colors[i];
  let points = 0, chain = 0;
  for (;;) {
    const hit = matches(b);
    if (hit.size < 4) break;
    chain++;
    points += hit.size * 10 * 2 ** (chain - 1);
    for (const k of hit) b[Math.floor(k / b[0].length)][k % b[0].length] = null;
    settle(b);
  }
  return { b, points };
}

function evaluate({ b, points }) {
  const R = b.length, C = b[0].length;
  let height = 0, maxH = 0, pairs = 0;
  for (let c = 0; c < C; c++) {
    let h = 0;
    for (let r = 0; r < R; r++) if (b[r][c]) { h = R - r; break; }
    height += h;
    maxH = Math.max(maxH, h);
  }
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (!b[r][c]) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < R && cc >= 0 && cc < C && b[rr][cc] === b[r][c]) pairs++;
    }
  }
  return points * 3 + pairs * 4 - height * 2 - (maxH > R - 4 ? 200 : 0) - maxH * 3;
}

export function choose(obs) {
  const board = obs.board.map((row) => [...row].map((ch) => (/[RBYG]/.test(ch) ? ch : null)));
  let best = null;
  for (const p of obs.placements) {
    const [, r, c] = p.split(" ").map(Number);
    const sim = simulate(board, obs.rotations[r], c);
    if (!sim) continue;
    const v = evaluate(sim);
    if (!best || v > best.v) best = { p, v };
  }
  return best ? best.p : obs.placements[0];
}
