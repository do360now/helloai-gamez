// TypeSafe Jev (System One) plays Block Drop. Jev answers typed questions, it does not generate text or
// search, so the split is: code enumerates every legal placement, simulates it, and describes the result in
// words; Jev answers one Choice question per piece ("which placement?"); code applies the answer.
//   TYPESAFE_API_KEY=... node agents/run.mjs jev block-drop-sprint-40
// Env: TYPESAFE_MODEL (default jev-latest), JEV_MODE=features|board (default features),
//      TYPESAFE_API_URL (default https://api.typesafe.ai), JEV_LOG=1 prints each decision.
const MODE = ["board", "score"].includes(process.env.JEV_MODE) ? process.env.JEV_MODE : "features";
const MODEL = process.env.TYPESAFE_MODEL || "jev-latest";
const BASE = (process.env.TYPESAFE_API_URL || "https://api.typesafe.ai").replace(/\/$/, "");

export const player = {
  id: MODE === "board" ? "typesafe-jev-board" : MODE === "score" ? "typesafe-jev-score" : "typesafe-jev",
  name: MODE === "board" ? "TypeSafe Jev (board only)" : MODE === "score" ? "TypeSafe Jev (scored)" : "TypeSafe Jev",
  kind: "llm",
  model: MODEL,
  harness: MODE === "score"
    ? "tools/agents/jev.mjs JEV_MODE=score: code simulates each legal placement and describes it in words; Jev rates every candidate with one Score question (5 levels) in a single request per piece; code plays the highest expected score. No search beyond one piece, no hold."
    : MODE === "board"
    ? "tools/agents/jev.mjs JEV_MODE=board: Jev sees the text board and picks one legal placement (column and rotation only) with a Choice question per piece; no features, no search, no hold."
    : "tools/agents/jev.mjs: code simulates each legal placement and describes it in words (lines cleared, new holes, landing height, surface); Jev picks one with a Choice question per piece; no search beyond one piece, no hold.",
  notes: "One attempt. Options are ordered by column then rotation. Jev is a decision model, not a generative LLM.",
};

// --- board simulation (pure code; Jev does no arithmetic) ---
function parseBoard(rows) { return rows.map((r) => [...r].map((c) => c === "#")); }

function drop(board, cells, col) {
  const H = board.length, W = board[0].length;
  const fits = (y) => cells.every(([x, cy]) => {
    const bx = col + x, by = y + cy;
    return bx >= 0 && bx < W && by < H && (by < 0 || !board[by][bx]);
  });
  if (!fits(0)) return null;
  let y = 0;
  while (fits(y + 1)) y++;
  return y;
}

function profile(b) {
  const H = b.length, W = b[0].length;
  const heights = [], holes = [];
  for (let c = 0; c < W; c++) {
    let top = H, h = 0;
    for (let r = 0; r < H; r++) if (b[r][c]) { top = r; break; }
    for (let r = top + 1; r < H; r++) if (!b[r][c]) h++;
    heights.push(H - top);
    holes.push(h);
  }
  let bump = 0;
  for (let c = 1; c < W; c++) bump += Math.abs(heights[c] - heights[c - 1]);
  let wellCol = -1, wellDepth = 0;
  for (let c = 0; c < W; c++) {
    const l = c === 0 ? Infinity : heights[c - 1], r = c === W - 1 ? Infinity : heights[c + 1];
    const d = Math.min(l, r) - heights[c];
    if (d > wellDepth) { wellDepth = d; wellCol = c; }
  }
  return { heights, holes: holes.reduce((a, x) => a + x, 0), maxHeight: Math.max(...heights), bump, wellCol, wellDepth };
}

function simulate(board, cells, col, y) {
  const H = board.length, W = board[0].length;
  const b = board.map((r) => r.slice());
  for (const [x, cy] of cells) b[y + cy][col + x] = true;
  const kept = b.filter((row) => !row.every(Boolean));
  const lines = H - kept.length;
  while (kept.length < H) kept.unshift(new Array(W).fill(false));
  const pieceBottom = y + Math.max(...cells.map((c) => c[1]));
  return { lines, landing: H - pieceBottom, after: profile(kept) };
}

function words(sim, before) {
  const newHoles = Math.max(0, sim.after.holes - before.holes);
  const h = sim.after.maxHeight;
  return {
    lines_cleared: ["clears no lines", "clears 1 line", "clears 2 lines", "clears 3 lines", "clears 4 lines at once (the best possible)"][sim.lines],
    new_holes: newHoles === 0 ? "buries no empty cells" : newHoles === 1 ? "buries 1 empty cell under the piece (a hole)" : `buries ${newHoles} empty cells under the piece (holes)`,
    landing: sim.landing <= 4 ? `lands low (row ${sim.landing} from the bottom)` : sim.landing <= 10 ? `lands mid-height (row ${sim.landing} from the bottom)` : `lands high (row ${sim.landing} from the bottom)`,
    stack_after: h <= 6 ? `stack stays low afterwards (tallest column ${h} of 20)` : h <= 12 ? `stack is medium afterwards (tallest column ${h} of 20)` : `stack is dangerously tall afterwards (tallest column ${h} of 20)`,
    surface: sim.after.bump <= 6 ? "surface stays flat" : sim.after.bump <= 14 ? "surface is somewhat uneven" : "surface is very jagged",
    well: sim.after.wellDepth >= 3 ? `leaves a ${sim.after.wellDepth}-deep well at column ${sim.after.wellCol}` : "no deep well",
  };
}

// --- Jev ---
async function ask(state, questions) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY is not set");
  for (let attempt = 0; attempt < 5; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    let res;
    try {
      res = await fetch(`${BASE}/v1/systemone`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, state, questions }),
        signal: ctl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    clearTimeout(timer);
    if (res.status === 429 || res.status === 529) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`typesafe ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  }
  throw new Error("typesafe: rate limited after 5 attempts");
}

const SHAPES = { I: "straight line", O: "square", T: "T", S: "S", Z: "Z", J: "J", L: "L" };
let usage = { input_tokens: 0, output_tokens: 0, calls: 0 };
export function stats() { return usage; }

export async function choose(obs) {
  const board = parseBoard(obs.board);
  const before = profile(board);
  const options = [];
  for (const p of obs.placements) {
    const [, r, c] = p.split(" ").map(Number);
    const cells = obs.rotations[r];
    const y = drop(board, cells, c);
    if (y === null) continue;
    const width = Math.max(...cells.map((k) => k[0])) + 1;
    const span = width === 1 ? `column ${c}` : `columns ${c}-${c + width - 1}`;
    const base = { placement: `${span}, rotation ${r} of ${obs.rotations.length}` };
    options.push({ key: p, c, r, desc: MODE === "board" ? base : { ...base, ...words(simulate(board, cells, c, y), before) } });
  }
  if (options.length === 0) return obs.placements[0];
  if (options.length === 1) return options[0].key;
  options.sort((a, b) => a.c - b.c || a.r - b.r);

  const criteria = {};
  for (const o of options) criteria[o.key] = o.desc;
  const state = {
    game: "A falling-block puzzle on a 10 wide by 20 tall board. Pieces fall from the top; a full row disappears and scores. " +
      "Clearing several rows with one piece pays far more than clearing them one at a time. The run ends when the stack reaches the top. " +
      `This run has a budget of ${obs.piecesLeft + obs.pieces} pieces; ${obs.piecesLeft} remain, so points per piece matter more than long-term setup near the end.`,
    current_piece: `${obs.piece.type} (${SHAPES[obs.piece.type] || obs.piece.type})`,
    next_piece: obs.next ? `${obs.next} (${SHAPES[obs.next] || obs.next})` : "unknown",
    board: "Rows top to bottom, columns 0-9 left to right. # filled, . empty.\n" + obs.board.map((r, i) => String(i).padStart(2, " ") + " " + r.replace(/[@+]/g, ".")).join("\n"),
  };
  if (MODE === "score") {
    const LEVELS = [
      "bad: buries empty cells under the piece, or leaves the stack dangerously tall",
      "poor: scores nothing and makes the surface more uneven or the stack taller",
      "neutral: scores nothing but leaves the board about as it was",
      "good: keeps the stack low and the surface even, or sets up a multi-row clear",
      "excellent: clears rows now without burying any empty cell",
    ];
    const qs = {};
    options.forEach((o, i) => {
      qs[`o${i}`] = {
        type: "score",
        instructions: { question: "How good is this placement of `current_piece` on `board` for a high score over the remaining pieces?", placement: o.desc },
        criteria: LEVELS,
      };
    });
    const res = await ask(state, qs);
    usage.calls++;
    usage.input_tokens += res.usage?.input_tokens || 0;
    usage.output_tokens += res.usage?.output_tokens || 0;
    player.model = res.model || MODEL;
    let best = null;
    options.forEach((o, i) => {
      const a = res.answers[`o${i}`];
      const expected = Object.entries(a.probabilities).reduce((sum, [lvl, p]) => sum + Number(lvl) * p, 0);
      if (!best || expected > best.expected) best = { key: o.key, expected, conf: a.confidence };
    });
    if (process.env.JEV_LOG) console.error(`piece ${obs.pieces + 1} ${obs.piece.type}: ${best.key} (expected ${best.expected.toFixed(2)} of 4, conf ${best.conf.toFixed(2)}) [${res.model}]`);
    return best.key;
  }

  const questions = {
    move: {
      type: "choice",
      instructions: MODE === "board"
        ? "Each option is a place to drop `current_piece` onto `board`. Choose the option that clears rows now or sets up multi-row clears soon, while keeping the stack low, avoiding empty cells trapped under filled ones, and keeping the surface even."
        : "Each option is a place to drop `current_piece` onto `board`, described by what the board looks like after the drop. Choose the option that scores the most rows now or keeps the board in the best shape for clearing rows soon: prefer clearing rows, strongly avoid burying empty cells, keep the stack low and the surface even, and keep one deep well for the straight piece rather than several.",
      criteria,
    },
  };
  const res = await ask(state, questions);
  usage.calls++;
  usage.input_tokens += res.usage?.input_tokens || 0;
  usage.output_tokens += res.usage?.output_tokens || 0;
  const a = res.answers.move;
  if (process.env.JEV_LOG) {
    const top = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(", ");
    console.error(`piece ${obs.pieces + 1} ${obs.piece.type}: ${a.choice} (conf ${a.confidence.toFixed(2)}; ${top}) [${res.model}]`);
  }
  player.model = res.model || MODEL;
  return criteria[a.choice] ? a.choice : options[0].key;
}
