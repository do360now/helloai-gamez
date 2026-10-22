// Classic hand-tuned baseline: El-Tetris (Yiyuan Lee, 2013), Pierre Dellacherie's features with tuned weights.
// It looks only at the current piece: no hold, no next-piece lookahead.
export const player = {
  id: "baseline-el-tetris",
  name: "El-Tetris heuristic",
  kind: "baseline",
  model: null,
  harness: "tools/agents/heuristic.mjs",
  notes: "Scores every placement with six board features and fixed weights. Current piece only.",
};

const W = {
  landingHeight: -4.500158825082766,
  rowsEliminated: 3.4181268101392694,
  rowTransitions: -3.2178882868487753,
  columnTransitions: -9.348695305445199,
  holes: -7.899265427351652,
  wellSums: -3.3855972247263626,
};

function parseBoard(rows) {
  // '@' (current piece) and '+' (its landing spot) are not on the board yet.
  return rows.map((r) => [...r].map((c) => c === "#"));
}

function drop(board, cells, col) {
  const H = board.length, Wd = board[0].length;
  const fits = (y) => cells.every(([x, cy]) => {
    const bx = col + x, by = y + cy;
    return bx >= 0 && bx < Wd && by < H && (by < 0 || !board[by][bx]);
  });
  if (!fits(0)) return null;
  let y = 0;
  while (fits(y + 1)) y++;
  return y;
}

function evaluate(board, cells, col, y) {
  const H = board.length, Wd = board[0].length;
  const b = board.map((r) => r.slice());
  for (const [x, cy] of cells) b[y + cy][col + x] = true;
  const pieceHeight = Math.max(...cells.map((c) => c[1])) + 1;
  const landingHeight = H - (y + pieceHeight / 2);

  let rowsEliminated = 0, cellsEliminated = 0;
  const kept = [];
  for (let r = 0; r < H; r++) {
    if (b[r].every(Boolean)) {
      rowsEliminated++;
      cellsEliminated += cells.filter(([, cy]) => y + cy === r).length;
    } else kept.push(b[r]);
  }
  while (kept.length < H) kept.unshift(new Array(Wd).fill(false));

  let rowTransitions = 0, columnTransitions = 0, holes = 0, wellSums = 0;
  for (let r = 0; r < H; r++) {
    let prev = true;
    for (let c = 0; c < Wd; c++) { if (kept[r][c] !== prev) rowTransitions++; prev = kept[r][c]; }
    if (!prev) rowTransitions++;
  }
  for (let c = 0; c < Wd; c++) {
    let prev = false, seen = false;
    for (let r = 0; r < H; r++) {
      if (kept[r][c] !== prev) columnTransitions++;
      prev = kept[r][c];
      if (kept[r][c]) seen = true;
      else if (seen) holes++;
    }
    if (!prev) columnTransitions++;
  }
  for (let c = 0; c < Wd; c++) {
    let depth = 0;
    for (let r = 0; r < H; r++) {
      const left = c === 0 || kept[r][c - 1], right = c === Wd - 1 || kept[r][c + 1];
      if (!kept[r][c] && left && right) { depth++; wellSums += depth; } else depth = 0;
    }
  }
  return W.landingHeight * landingHeight + W.rowsEliminated * rowsEliminated * cellsEliminated +
    W.rowTransitions * rowTransitions + W.columnTransitions * columnTransitions +
    W.holes * holes + W.wellSums * wellSums;
}

export function choose(obs) {
  const board = parseBoard(obs.board);
  let best = null;
  for (const p of obs.placements) {
    const [, r, c] = p.split(" ").map(Number);
    const cells = obs.rotations[r];
    const y = drop(board, cells, c);
    if (y === null) continue;
    const v = evaluate(board, cells, c, y);
    if (!best || v > best.v) best = { p, v };
  }
  return best ? best.p : obs.placements[0];
}
