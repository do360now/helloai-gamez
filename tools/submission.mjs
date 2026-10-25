// Turns a run-submission issue (.github/ISSUE_TEMPLATE/run-submission.yml) into a run file under data/runs/.
//   node submission.mjs <github-event.json> --out <result.json>
// Writes data/runs/<game>/<bench>/<id>.json and a result {ok, file, id, score, ..., commit, prBody}, or
// {ok: false, error} when the issue is not a valid submission. Exits 0 either way; the replay is verify.mjs's job.
// The id is the submitter's GitHub login (plus an optional label), so a visitor can only replace their own runs,
// and only with a better one.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Issue forms render each field as "### <label>\n\n<value>", with "_No response_" for an empty one.
export function parseIssueForm(body) {
  const fields = {};
  const parts = String(body || "").replace(/\r\n/g, "\n").split(/^### +(.+)$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const value = parts[i + 1].trim();
    fields[parts[i].trim()] = value === "_No response_" ? "" : value;
  }
  return fields;
}

// The same rule the banner uses for names agents may read: letters, digits and a little punctuation, 40 characters.
export function plainName(name) {
  return String(name || "").replace(/[^A-Za-z0-9 .()+_-]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

function plainText(s, max) {
  return String(s || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f`@]/g, "").trim().slice(0, max);
}

export function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function stripFence(s) {
  const m = /^```[a-z]*\n([\s\S]*?)\n?```$/.exec(String(s).trim());
  return m ? m[1] : s;
}

const FIELDS = { run: "Run JSON", name: "Display name", label: "Run label", kind: "Who played", model: "Model",
  harness: "How it was played", notes: "Notes", disclosure: "Disclosure (Night Shift only)" };
const KINDS = { "human": "human", "an llm": "llm", "an agent": "agent" };
const MAX_ACTIONS = 5000;

// Ranked like the scoreboard: score, then the benchmark's tiebreak stat (lower wins).
function better(a, b, tiebreak) {
  if (a.score !== b.score) return a.score > b.score;
  const x = tiebreak && a.stats ? a.stats[tiebreak] : undefined;
  const y = tiebreak && b.stats ? b.stats[tiebreak] : undefined;
  return typeof x === "number" && typeof y === "number" && x < y;
}

// Checks the issue and returns {ok, run, file, ...} or {ok: false, error}. existing(file) returns the run already
// at that path, or null.
export function buildSubmission(issue, benchmarks, existing, today) {
  const fail = (error) => ({ ok: false, error });
  const login = String(issue.user && issue.user.login || "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(login)) return fail("the issue has no usable GitHub login");
  const f = parseIssueForm(issue.body);
  const get = (k) => f[FIELDS[k]] || "";

  let raw;
  try { raw = JSON.parse(stripFence(get("run"))); } catch (e) { return fail("Run JSON is not valid JSON: " + e.message); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Run JSON must be the object from arcade.run() or the downloaded file");
  const bench = benchmarks.find((b) => b.game === raw.game && b.bench === raw.bench);
  if (!bench) return fail(`no benchmark ${raw.game}/${raw.bench}`);
  if (raw.protocol !== "arcade/0.1") return fail('protocol must be "arcade/0.1"');
  if (raw.seed !== bench.seed) return fail(`seed ${raw.seed} is not the benchmark seed ${bench.seed}`);
  if (raw.mode !== "turn") return fail("only turn-based runs can be replayed (play with ?agent=1)");
  if (!Array.isArray(raw.actions) || !raw.actions.length || raw.actions.length > MAX_ACTIONS ||
    !raw.actions.every((a) => typeof a === "string" && a.length <= 200)) return fail(`actions must be 1 to ${MAX_ACTIONS} strings`);
  if (!Number.isInteger(raw.score) || raw.score < 0) return fail("score must be a whole number");
  if (raw.over !== true) return fail("the run is not over; finish the game before submitting");
  const stats = raw.stats && typeof raw.stats === "object" && !Array.isArray(raw.stats) ? raw.stats : null;
  if (!stats || !Object.values(stats).every((v) => typeof v === "number")) return fail("stats must be an object of numbers");

  const name = plainName(get("name"));
  if (!name) return fail("Display name is empty (letters, digits, spaces and . ( ) + _ - only)");
  const kind = KINDS[get("kind").toLowerCase()];
  if (!kind) return fail("Who played must be one of: " + Object.keys(KINDS).join(", "));
  const player = { id: "", name, kind, model: plainText(get("model"), 80) || null,
    harness: plainText(get("harness"), 300), notes: plainText(get("notes"), 1000), github: login };
  if (bench.disclosure) {
    const d = get("disclosure").toLowerCase();
    if (d !== "blind" && d !== "open-book") return fail("this benchmark needs Disclosure: blind or open-book");
    player.disclosure = d;
  }

  const label = slug(get("label"));
  // GitHub logins never contain "--" and slug() collapses dashes, so login--label cannot be another login's id.
  player.id = label ? `${login}--${label}` : login;
  const file = `data/runs/${bench.game}/${bench.bench}/${player.id}.json`;
  const run = { protocol: raw.protocol, game: raw.game, bench: raw.bench, seed: raw.seed, mode: raw.mode,
    actions: raw.actions, score: raw.score, over: true, stats, player, date: today };

  const prev = existing(file);
  if (prev && (!prev.player || prev.player.github !== login)) {
    return fail(`the id ${player.id} belongs to another run; change Run label`);
  }
  if (prev && !better(run, prev, bench.tiebreak)) {
    return fail(`your run at ${file} already scores ${prev.score}; a replacement must beat it`);
  }

  const score = run.score.toLocaleString("en-US");
  // Free text in the PR body is one line of letters, digits and plain punctuation in a code span: no # or URL to
  // close an issue, no | or newline to break out of the table.
  const code = (v) => {
    const t = String(v || "").replace(/[^A-Za-z0-9 .,;:()+_=?!'"-]/g, " ").replace(/\s+/g, " ").trim();
    return t ? "`" + t + "`" : "none";
  };
  const commit = `runs: ${bench.title}, ${name} (${score})\n\nSubmitted by @${login} in #${issue.number}.`;
  const prBody = [
    `${name} scores **${score}** on ${bench.title}${prev ? `, replacing ${prev.score.toLocaleString("en-US")}` : ""}.`,
    "",
    `| Field | Value |`, `|---|---|`,
    `| Player id | \`${player.id}\` |`, `| Kind | ${kind} |`, `| Model | ${code(player.model)} |`,
    `| How | ${code(player.harness)} |`, `| Moves | ${run.actions.length} |`,
    ...(player.disclosure ? [`| Disclosure | ${player.disclosure} |`] : []),
    "",
    `Closes #${issue.number}`,
  ].join("\n");
  return { ok: true, run, file, id: player.id, name, score: run.score, title: bench.title,
    replaces: prev ? prev.score : null, branch: `run/issue-${issue.number}`, commit, prBody };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const oi = args.indexOf("--out");
  const out = oi >= 0 ? args.splice(oi, 2)[1] : null;
  if (!args[0] || !out) {
    console.error("usage: node submission.mjs <github-event.json> --out <result.json>");
    process.exit(2);
  }
  const event = JSON.parse(await readFile(args[0], "utf8"));
  const benchmarks = JSON.parse(await readFile(path.join(root, "data/benchmarks.json"), "utf8"));
  // existing() is synchronous, so read every benchmark's runs up front.
  const cache = {};
  for (const b of benchmarks) {
    const dir = path.join(root, "data/runs", b.game, b.bench);
    let names = [];
    try { names = (await readdir(dir)).filter((n) => n.endsWith(".json")); } catch { continue; }
    for (const n of names) cache[`data/runs/${b.game}/${b.bench}/${n}`] = JSON.parse(await readFile(path.join(dir, n), "utf8"));
  }
  const result = buildSubmission(event.issue || {}, benchmarks, (f) => cache[f] || null, new Date().toISOString().slice(0, 10));
  if (result.ok) {
    await mkdir(path.dirname(path.join(root, result.file)), { recursive: true });
    await writeFile(path.join(root, result.file), JSON.stringify(result.run) + "\n");
  }
  const { run, ...summary } = result;
  await writeFile(out, JSON.stringify(summary, null, 1) + "\n");
  console.log(result.ok ? `wrote ${result.file}: score ${result.score}` : `not a valid submission: ${result.error}`);
}
