// Baseline for Rustwater Havoc with a little intent: it plays Sal's wanted-cars list and nothing else.
// Walk to a parked or passing car of a wanted type, steal it, drive it to Sal's Garage, stop there. Repeat.
// It reads only observe(): the text map (a shortest path over the 31 x 19 tiles), the car list and the heading.
export const player = {
  id: "baseline-seeker",
  name: "Sal's list seeker",
  kind: "baseline",
  model: null,
  harness: "tools/agents/rustwater-seeker.mjs",
  notes: "Reads observe() JSON (map, cars, Sal's list); shortest path over the visible map, a steering rule on the heading; ignores Teo's jobs, taxi duty and the Bridge Run.",
};

const COLS = 15, ROWS = 9, W = 31, H = 19;
let stuck = 0, lastPos = null, recover = 0, waits = 0, idle = 0;

function plan(obs, goalX, goalZ, car) {   // goalX/Z in metres; returns the next waypoint (metres) or null
  const rows = obs.map, cost = (ch) => (ch === "#" || ch === "~" ? Infinity : car && ch === "," ? 3 : 1);
  const px = obs.pos.x, pz = obs.pos.z, tx = obs.pos.tx, tz = obs.pos.tz;
  const gc = Math.floor(goalX / 10) - tx + COLS, gr = Math.floor(goalZ / 10) - tz + ROWS;
  const dist = Array.from({ length: H }, () => new Array(W).fill(Infinity)), prev = Array.from({ length: H }, () => new Array(W).fill(null));
  dist[ROWS][COLS] = 0;
  const open = [[0, ROWS, COLS]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, r, c] = open.shift();
    if (d > dist[r][c]) continue;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r2 = r + dr, c2 = c + dc;
      if (r2 < 0 || r2 >= H || c2 < 0 || c2 >= W) continue;
      const k = cost(rows[r2][c2]);
      if (k === Infinity || d + k >= dist[r2][c2]) continue;
      dist[r2][c2] = d + k; prev[r2][c2] = [r, c]; open.push([d + k, r2, c2]);
    }
  }
  let best = null, bs = Infinity;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (dist[r][c] === Infinity) continue;
    const s = Math.hypot(c - gc, r - gr) * 4 + dist[r][c] * 0.2;
    if (s < bs) { bs = s; best = [r, c]; }
  }
  if (!best || (best[0] === ROWS && best[1] === COLS)) return null;
  const path = [];
  for (let n = best; n; n = prev[n[0]][n[1]]) path.push(n);
  path.reverse();   // from the player's tile to the goal tile
  const look = path[Math.min(car ? 3 : 1, path.length - 1)];
  return [(tx + look[1] - COLS + 0.5) * 10, (tz + look[0] - ROWS + 0.5) * 10];
}

function drive(obs, wx, wz, vmax) {
  const des = Math.atan2(wx - obs.pos.x, -(wz - obs.pos.z)) * 180 / Math.PI;
  let diff = ((des - obs.car.heading + 540) % 360) - 180, sp = obs.car.speed;
  if (lastPos && Math.hypot(obs.pos.x - lastPos[0], obs.pos.z - lastPos[1]) < 0.6) stuck++; else stuck = 0;
  lastPos = [obs.pos.x, obs.pos.z];
  if (recover > 0) { recover--; return recover > 3 ? "down 2" : diff > 0 ? "down+left 2" : "down+right 2"; }
  if (stuck >= 4) { stuck = 0; recover = 6; return "down 2"; }
  if (Math.abs(diff) > 100 && sp < 6) return diff > 0 ? "up+right 2" : "up+left 2";
  const cap = Math.abs(diff) > 35 ? Math.min(vmax, 10) : vmax;
  if (sp > cap + 3) return "down 1";
  if (Math.abs(diff) < 10) return sp > cap ? "wait 1" : "up 1";
  return sp > cap ? (diff > 0 ? "right 1" : "left 1") : diff > 0 ? "up+right 1" : "up+left 1";
}

function walk(obs, wx, wz) {
  const dx = wx - obs.pos.x, dz = wz - obs.pos.z;
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "right 1" : "left 1") : dz > 0 ? "down 1" : "up 1";
}

export function choose(obs) {
  if (obs.state === "dead") { recover = 0; return "respawn"; }
  const wants = obs.sal.wants.map((w) => w.type).filter((t) => t !== "police");
  const gx = obs.pos.x + obs.sal.garage.dx * 10, gz = obs.pos.z + obs.sal.garage.dz * 10;
  if (obs.car) {
    const c = obs.car, toGarage = Math.hypot(gx - obs.pos.x, gz - obs.pos.z);
    if (wants.includes(c.type) && c.health > 25 && !c.onFire) {
      if (toGarage < 4) { idle = 0; return Math.abs(c.speed) > 2 ? "down 1" : "wait 1"; }
      if (toGarage < 12 && Math.abs(c.speed) < 2 && ++idle > 3) return "up 1";   // stopped short of the 5 m ring: creep in
      const wp = plan(obs, gx, gz, true) || [gx, gz];
      return drive(obs, wp[0], wp[1], toGarage < 30 ? 6 : 22);
    }
    // the wrong car: stop and get out, then look for a wanted one
    return Math.abs(c.speed) > 2 ? "down 2" : "enter";
  }
  const cand = obs.cars.filter((o) => wants.includes(o.type) && o.kind !== "wreck" && o.health > 40).sort((a, b) => a.dist - b.dist)[0];
  if (cand) {
    waits = 0;
    if (Math.hypot(cand.dx, cand.dz) < 0.4) return "enter";
    const tx = obs.pos.x + cand.dx * 10, tz = obs.pos.z + cand.dz * 10;
    const wp = plan(obs, tx, tz, false) || [tx, tz];
    return walk(obs, wp[0], wp[1]);
  }
  // nothing wanted in sight: head for the garage on foot and wait for traffic to bring one
  if (Math.hypot(gx - obs.pos.x, gz - obs.pos.z) < 120 && ++waits % 3 !== 0) return "wait 4";
  const wp = plan(obs, gx, gz, false) || [gx, gz];
  return walk(obs, wp[0], wp[1]);
}
