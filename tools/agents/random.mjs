// Baseline floor: a uniformly random legal placement for every piece (fixed seed, so it is repeatable).
export const player = {
  id: "baseline-random",
  name: "Random placer",
  kind: "baseline",
  model: null,
  harness: "tools/agents/random.mjs",
  notes: "Picks a random legal placement for every piece.",
};

let state = 12345;
function random() {
  state = (Math.imul(state, 1103515245) + 12345) >>> 0;
  return state / 4294967296;
}

export function choose(obs) {
  return obs.placements[Math.floor(random() * obs.placements.length)];
}
