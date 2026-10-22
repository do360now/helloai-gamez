import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { replay, loadWorld } from "../night-shift.mjs";

// Recorded runs that must keep replaying exactly. A world or engine change that breaks one is
// either a bug or a deliberate rules change, and a rules change needs a new benchmark id.
const world = await loadWorld();
const dir = new URL("./fixtures/", import.meta.url);
for (const name of (await readdir(dir)).filter((n) => n.startsWith("night-shift-") && n.endsWith(".json"))) {
  test("fixture replays exactly: " + name, async () => {
    const run = JSON.parse(await readFile(new URL(name, dir), "utf8"));
    const got = replay(world, run);
    assert.equal(got.applied, run.actions.length);
    assert.equal(got.score, run.score);
    assert.deepEqual(got.stats, run.stats);
    assert.equal(got.over, true);
  });
}
