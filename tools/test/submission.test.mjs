import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSubmission, parseIssueForm } from "../submission.mjs";

const benchmarks = JSON.parse(await readFile(new URL("../../data/benchmarks.json", import.meta.url), "utf8"));
const haiku = JSON.parse(await readFile(new URL("../../data/runs/block-drop/sprint-40/claude-haiku-5-5.json", import.meta.url), "utf8"));
const night = JSON.parse(await readFile(new URL("../../data/runs/night-shift/case-150/player1.json", import.meta.url), "utf8"));

// An issue body as GitHub renders the run-submission form.
function body(fields) {
  const f = { "Run JSON": "```json\n" + JSON.stringify(haiku) + "\n```", "Display name": "Ada", "Who played": "Human",
    "Model": "", "How it was played": "by hand", "Notes": "", "Run label": "", "Disclosure (Night Shift only)": "", ...fields };
  return Object.entries(f).map(([k, v]) => `### ${k}\n\n${v === "" ? "_No response_" : v}`).join("\n\n");
}
const issue = (fields, login = "Ada-L") => ({ number: 7, user: { login }, body: body(fields) });
const none = () => null;
const submit = (fields, existing = none, login) => buildSubmission(issue(fields, login), benchmarks, existing, "2026-10-25");

test("parses issue form sections and blanks _No response_", () => {
  const f = parseIssueForm("### A\n\none\n\n### B\n\n_No response_\n\n### C\n\nmulti\nline");
  assert.deepEqual(f, { A: "one", B: "", C: "multi\nline" });
});

test("a valid run becomes a file under the submitter's login", () => {
  const r = submit({});
  assert.equal(r.ok, true, r.error);
  assert.equal(r.file, "data/runs/block-drop/sprint-40/ada-l.json");
  assert.deepEqual(r.run.actions, haiku.actions);
  assert.equal(r.run.score, 3300);
  assert.deepEqual(r.run.player, { id: "ada-l", name: "Ada", kind: "human", model: null, harness: "by hand", notes: "", github: "ada-l" });
  assert.equal(r.run.date, "2026-10-25");
  assert.match(r.prBody, /Closes #7/);
});

test("a label is appended to the id; the player block in the JSON is ignored", () => {
  const r = submit({ "Run label": "Opus 5.5!", "Who played": "An LLM", "Model": "claude-opus-5-5" });
  assert.equal(r.id, "ada-l--opus-5-5");
  assert.equal(r.run.player.kind, "llm");
  assert.equal(r.run.player.model, "claude-opus-5-5");
});

test("names lose characters agents could read as markup or mentions", () => {
  assert.equal(submit({ "Display name": "<b>@root</b> `x`" }).run.player.name, "brootb x");
  assert.equal(submit({ "Display name": "@@@" }).ok, false);
});

test("rejects runs that cannot be replayed", () => {
  const bad = (patch) => submit({ "Run JSON": JSON.stringify({ ...haiku, ...patch }) });
  assert.match(bad({ mode: "realtime" }).error, /turn-based/);
  assert.match(bad({ seed: 1 }).error, /seed/);
  assert.match(bad({ bench: "nope" }).error, /no benchmark/);
  assert.match(bad({ over: false }).error, /not over/);
  assert.match(bad({ actions: [] }).error, /actions/);
  assert.match(submit({ "Run JSON": "{nope" }).error, /not valid JSON/);
});

test("Night Shift needs a disclosure", () => {
  assert.match(submit({ "Run JSON": JSON.stringify(night) }).error, /Disclosure/);
  const r = submit({ "Run JSON": JSON.stringify(night), "Disclosure (Night Shift only)": "blind" });
  assert.equal(r.run.player.disclosure, "blind");
});

test("only the same login can replace a run, and only with a better one", () => {
  const theirs = (f) => (f.endsWith("/ada-l.json") ? { ...haiku, player: { github: "someone-else" } } : null);
  assert.match(submit({}, theirs).error, /belongs to another run/);
  const mine = (score) => (f) => (f.endsWith("/ada-l.json") ? { ...haiku, score, player: { github: "ada-l" } } : null);
  assert.match(submit({}, mine(3300)).error, /must beat it/);
  const r = submit({}, mine(3000));
  assert.equal(r.ok, true);
  assert.equal(r.replaces, 3000);
});

test("ids taken by maintainer runs cannot be claimed through a label", () => {
  const existing = (f) => (f.endsWith("/claude-haiku-5-5.json") ? haiku : null);
  assert.match(submit({}, existing, "claude-haiku-5-5").error, /belongs to another run/);
});

test("a login plus a label never lands on another login's id", () => {
  assert.equal(submit({ "Run label": "l" }, none, "ada").id, "ada--l");
  assert.equal(submit({}, none, "ada-l").id, "ada-l");
});

test("free text in the PR body cannot close issues or break the table", () => {
  const r = submit({ "How it was played": "Closes #1 | fixes #2", "Model": "m#3" });
  assert.ok(!/#\d/.test(r.prBody.replace(/Closes #7$/, "")), r.prBody);
  assert.ok(r.prBody.includes("| How | `Closes  1   fixes  2` |"), r.prBody);
});
