// Baseline floor for Rustwater Havoc: random legal actions (fixed seed, so it is repeatable).
export const player = {
  id: "baseline-random",
  name: "Random driver",
  kind: "baseline",
  model: null,
  harness: "tools/agents/rustwater-random.mjs",
  notes: "Picks a random action each turn; respawns when it is wasted or busted.",
};

let state = 12345;
function random() {
  state = (Math.imul(state, 1103515245) + 12345) >>> 0;
  return state / 4294967296;
}
const MOVES = ["up 4", "up 6", "up+left 2", "up+right 2", "down 2", "handbrake 1", "up+left+handbrake 3", "wait 2", "enter", "left 2", "right 2"];

export function choose(obs) {
  if (obs.state === "dead") return "respawn";
  return MOVES[Math.floor(random() * MOVES.length)];
}
