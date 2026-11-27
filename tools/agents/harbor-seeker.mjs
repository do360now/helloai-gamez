// Baseline for Harbor City Havoc with a little intent: it does the three payphone missions in order.
// Walk to the nearest payphone and take the call; M1 get a car and drive onto the marker; M2 drive fast through
// traffic and past pedestrians for mayhem; M3 raise the heat to 2 stars, then drive away from the police.
// It reads only observe(). It remembers the terrain of every 31 x 19 text map it has seen, so it can plan a
// shortest path across the 64 x 64 city (unseen tiles count as passable until it sees them).
export const player = {
  id: "baseline-seeker",
  name: "Payphone seeker",
  kind: "baseline",
  model: null,
  harness: "tools/agents/harbor-seeker.mjs",
  notes: "Reads observe() JSON and its text map; remembers terrain it has seen and plans shortest paths over it; a steering rule on the heading. Does the payphone missions in order.",
};

const N = 64;
const known = Array.from({ length: N }, () => new Array(N).fill(null));
let last = null, heading = 0, stuck = 0, recover = 0, tour = 0, footStill = 0, turn = 0;
const skip = new Map();   // car id -> turn until which it is ignored (it could not be reached on foot)

// ---- memory of the text map -------------------------------------------------------------------------------------
function remember(text) {
  const lines = text.split("\n");
  const t = lines.findIndex((l) => l.startsWith("terrain:"));
  if (t < 0) return;
  const tens = lines[t + 1], ones = lines[t + 2];
  let tx0 = null;
  for (let i = 3; i < ones.length; i++) {
    if (/\d/.test(ones[i]) && /\d/.test(tens[i])) { tx0 = Number(tens[i]) * 10 + Number(ones[i]) - (i - 3); break; }
  }
  if (tx0 === null) return;
  for (let r = 0; r < 19; r++) {
    const row = lines[t + 3 + r];
    if (!row) break;
    const ty = parseInt(row.slice(0, 2), 10);
    if (!(ty >= 0 && ty < N)) continue;
    const cells = row.slice(3);
    for (let c = 0; c < cells.length; c++) {
      const tx = tx0 + c, ch = cells[c];
      if (tx >= 0 && tx < N && '.,#"~='.includes(ch)) known[ty][tx] = ch;
    }
  }
}

// ---- shortest path over remembered terrain (Dijkstra with a binary heap) -----------------------------------------
function cost(ch, car) {
  if (ch === "#" || ch === "~") return Infinity;
  if (!car) return ch === null ? 1.5 : 1;
  return ch === "." ? 1 : ch === null ? 2 : ch === "," ? 3 : 4;
}
function path(sx, sy, gx, gy, car) {
  const idx = (x, y) => y * N + x, dist = new Float64Array(N * N).fill(Infinity), prev = new Int32Array(N * N).fill(-1);
  const heap = [];
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], end = heap.pop(); if (heap.length) { heap[0] = end; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const s = idx(sx, sy), g = idx(gx, gy);
  dist[s] = 0; push(0, s);
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    if (i === g) break;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x2 = x + dx, y2 = y + dy;
      if (x2 < 0 || y2 < 0 || x2 >= N || y2 >= N) continue;
      const j = idx(x2, y2), k = j === g ? 1 : cost(known[y2][x2], car);
      if (d + k < dist[j]) { dist[j] = d + k; prev[j] = i; push(d + k, j); }
    }
  }
  if (dist[g] === Infinity) return null;
  const out = [];
  for (let i = g; i !== -1; i = prev[i]) out.push([i % N, (i / N) | 0]);
  return out.reverse();
}

// ---- movement ---------------------------------------------------------------------------------------------------
const DIRS = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v) => Math.max(0, Math.min(N - 1, Math.floor(v)));

function walkToward(obs, x, y) {   // x, y in tiles
  const p = path(clamp(obs.at.x), clamp(obs.at.y), clamp(x), clamp(y), false);
  let wx = x, wy = y;
  if (p && p.length > 2) { wx = p[1][0] + 0.5; wy = p[1][1] + 0.5; }
  const dx = wx - obs.at.x, dy = wy - obs.at.y;
  const keys = [];
  if (dy < -0.25) keys.push("up"); else if (dy > 0.25) keys.push("down");
  if (dx < -0.25) keys.push("left"); else if (dx > 0.25) keys.push("right");
  return keys.length ? keys.join("+") + " 1" : "wait 1";
}

function driveToward(obs, x, y, { fast = false } = {}) {
  if (recover > 0) { recover--; return recover > 1 ? "down 2" : (stuck % 2 ? "down+left 2" : "down+right 2"); }
  const p = path(clamp(obs.at.x), clamp(obs.at.y), clamp(x), clamp(y), true);
  let wx = x, wy = y;
  if (p && p.length > 1) { const k = Math.min(p.length - 1, 3); wx = p[k][0] + 0.5; wy = p[k][1] + 0.5; }
  const diff = wrap(Math.atan2(wy - obs.at.y, wx - obs.at.x) - heading);
  const speed = obs.car.speed, a = Math.abs(diff), turn = diff > 0 ? "right" : "left";
  if (a < 0.3) return fast || speed < 5 ? "up 2" : "up 1";
  if (a < 1.0) return speed > 6 ? `${turn} 1` : `up+${turn} 1`;
  return speed > 3 ? `${turn}+handbrake 1` : `up+${turn} 1`;
}

// Track heading from movement (the observed heading is only one of 8 directions) and notice when the car is stuck.
function track(obs) {
  if (obs.inCar) {
    const coarse = DIRS[obs.car.heading] * Math.PI / 4;
    if (last && last.inCar) {
      const mx = obs.at.x - last.x, my = obs.at.y - last.y, moved = Math.hypot(mx, my);
      heading = moved > 0.25 ? Math.atan2(my, mx) : coarse;
      if (obs.car.speed < 0) heading = coarse;
      if (moved < 0.15 && recover === 0) { if (++stuck >= 3) { recover = 3; stuck++; } } else if (moved >= 0.15) stuck = stuck % 2;
    } else heading = coarse;
  } else if (last && !last.inCar) {
    footStill = Math.hypot(obs.at.x - last.x, obs.at.y - last.y) < 0.05 ? footStill + 1 : 0;
  }
  last = { x: obs.at.x, y: obs.at.y, inCar: obs.inCar };
}

// ---- the plan -----------------------------------------------------------------------------------------------------
const nearestPhone = (obs) => obs.payphones.slice().sort((a, b) => a.dist - b.dist)[0];

function getCar(obs) {
  const cars = obs.world.cars.filter((c) => c.kind !== "wreck" && !(skip.get(c.id) > turn)).sort((a, b) => (a.kind === "parked" ? 0 : 3) + a.dist - ((b.kind === "parked" ? 0 : 3) + b.dist));
  const c = cars[0];
  if (!c) return "wait 2";
  if (obs.can.enterCar && c.dist < 1.5) return "enter";
  if (footStill >= 4) { skip.set(c.id, turn + 60); footStill = 0; }
  return walkToward(obs, obs.at.x + c.dx, obs.at.y + c.dy);
}

function cruise(obs) {   // mayhem: drive fast toward pedestrians or traffic, else tour the payphones
  const ped = obs.world.peds.filter((p) => !p.fleeing)[0];
  const t = obs.world.cars.filter((c) => c.kind === "traffic")[0];
  const goal = ped && ped.dist < 8 ? ped : t && t.dist < 8 ? t : null;
  if (goal) return driveToward(obs, obs.at.x + goal.dx, obs.at.y + goal.dy, { fast: true });
  let p = obs.payphones[tour % obs.payphones.length];
  if (p.dist < 3) { tour++; p = obs.payphones[tour % obs.payphones.length]; }
  return driveToward(obs, obs.at.x + p.dx, obs.at.y + p.dy, { fast: true });
}

export function choose(obs) {
  turn++;
  remember(obs.text);
  if (obs.can.respawn) { last = null; recover = 0; return "respawn"; }
  track(obs);
  const m = obs.mission;
  if (!m) {
    const ph = nearestPhone(obs);
    if (obs.inCar) return ph.dist < 2.5 ? "enter" : driveToward(obs, obs.at.x + ph.dx, obs.at.y + ph.dy);
    if (obs.can.usePayphone) return "enter";
    return walkToward(obs, obs.at.x + ph.dx, obs.at.y + ph.dy);
  }
  if (!obs.inCar) return getCar(obs);
  if (m.number === 1) return driveToward(obs, obs.at.x + m.marker.dx, obs.at.y + m.marker.dy, { fast: true });
  if (m.number === 2) return cruise(obs);
  // M3: reach 2 stars, then get away from the police (head for the payphone farthest from the nearest police car)
  if (!/heat reached/.test(obs.text)) return cruise(obs);
  const cop = obs.world.police[0];
  if (!cop) return cruise(obs);
  const far = obs.payphones.slice().sort((a, b) => Math.hypot(b.dx - cop.dx, b.dy - cop.dy) - Math.hypot(a.dx - cop.dx, a.dy - cop.dy))[0];
  return driveToward(obs, obs.at.x + far.dx, obs.at.y + far.dy, { fast: true });
}
