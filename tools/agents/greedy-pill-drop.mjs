// Pill Drop baseline: tries every legal placement on a copy of the board, plays out the matches
// (pill halves fall freely, bonds are ignored), and prefers germs cleared and same-color stacking.
export const player = {
  id: "baseline-greedy",
  name: "Greedy one-move lookahead",
  kind: "baseline",
  model: null,
  harness: "tools/agents/greedy-pill-drop.mjs",
  notes: "Simulates each placement with a simplified gravity (ignores pill bonds); current pill only.",
};

const ORIENT = [[1, 0], [0, -1], [-1, 0], [0, 1]];

function parse(rows) {
  return rows.map((row) => [...row].map((ch) => (/[PBY]/.test(ch) ? { c: ch, germ: true } : /[pby]/.test(ch) ? { c: ch.toUpperCase(), germ: false } : null)));
}

function runs(b) {
  const R = b.length, C = b[0].length, hit = new Set();
  for (let r = 0; r < R; r++) for (let c = 0; c < C; ) {
    if (!b[r][c]) { c++; continue; }
    let e = c;
    while (e < C && b[r][e] && b[r][e].c === b[r][c].c) e++;
    if (e - c >= 4) for (let k = c; k < e; k++) hit.add(r * C + k);
    c = e;
  }
  for (let c = 0; c < C; c++) for (let r = 0; r < R; ) {
    if (!b[r][c]) { r++; continue; }
    let e = r;
    while (e < R && b[e][c] && b[e][c].c === b[r][c].c) e++;
    if (e - r >= 4) for (let k = r; k < e; k++) hit.add(k * C + c);
    r = e;
  }
  return hit;
}

function simulate(board, colors, ori, col) {
  const b = board.map((r) => r.slice());
  const o = ORIENT[ori];
  // Cells relative to the leftmost/top-most anchor, with the colors of the two halves.
  let cells = [{ x: 0, y: 0, c: colors[0] }, { x: o[0], y: o[1], c: colors[1] }];
  const minX = Math.min(...cells.map((k) => k.x)), minY = Math.min(...cells.map((k) => k.y));
  cells = cells.map((k) => ({ x: k.x - minX + col, y: k.y - minY, c: k.c }));
  const fits = (dy) => cells.every((k) => k.y + dy < b.length && k.x < b[0].length && !b[k.y + dy][k.x]);
  if (!fits(1)) return null;
  let dy = 1;
  while (fits(dy + 1)) dy++;
  for (const k of cells) b[k.y + dy][k.x] = { c: k.c, germ: false };
  let germs = 0, halves = 0, chain = 0;
  for (;;) {
    const hit = runs(b);
    if (!hit.size) break;
    chain++;
    for (const k of hit) {
      const cell = b[Math.floor(k / b[0].length)][k % b[0].length];
      if (cell.germ) germs++; else halves++;
      b[Math.floor(k / b[0].length)][k % b[0].length] = null;
    }
    for (let c = 0; c < b[0].length; c++) for (let r = b.length - 2; r >= 0; r--) {
      if (!b[r][c] || b[r][c].germ) continue;
      let rr = r;
      while (rr + 1 < b.length && !b[rr + 1][c]) rr++;
      if (rr !== r) { b[rr][c] = b[r][c]; b[r][c] = null; }
    }
  }
  return { b, germs, halves, chain, top: Math.min(...cells.map((k) => k.y + dy)) };
}

function evaluate(sim) {
  const { b } = sim;
  let stack = 0, covered = 0;
  for (let r = 0; r < b.length; r++) for (let c = 0; c < b[0].length; c++) {
    const v = b[r][c];
    if (!v) continue;
    const below = r + 1 < b.length ? b[r + 1][c] : null;
    if (below && below.c === v.c) stack += below.germ ? 3 : 1;          // same color on top of a germ is progress
    if (below && below.c !== v.c && below.germ) covered += 1;            // burying a germ under another color
  }
  return sim.germs * 100 + sim.halves * 8 + sim.chain * 30 + stack * 6 - covered * 9 - Math.max(0, 6 - sim.top) * 25;
}

export function choose(obs) {
  const board = parse(obs.board);
  const colors = obs.pill.colors;
  let best = null;
  for (const p of obs.placements) {
    const [, r, c] = p.split(" ").map(Number);
    const sim = simulate(board, colors, r, c);
    if (!sim) continue;
    const v = evaluate(sim);
    if (!best || v > best.v) best = { p, v };
  }
  return best ? best.p : obs.placements[0];
}
