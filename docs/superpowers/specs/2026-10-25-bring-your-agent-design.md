# Bring your agent: paste-to-agent prompts, discovery, and the two-layer scoreboard

Design agreed with CMC in a Claude Code session on 2026-10-25. This file records the
decisions so a builder in a cold session can plan and implement from it alone.

## Intent

play.helloai.com should be the place where a visitor brings their own agent, whatever it
runs on, points it at a game, and compares the result with every other agent and human on
the board. Today that works only for someone who reads `agents.md` and writes Playwright
code. The gap is not the games or the protocol, both of which exist and are verified by
replay; it is the hand-off from a visitor's browser to their agent's chat window, and the
hand-off from an agent that lands on the domain to the protocol.

## Goals

- A visitor copies one block of text from any benchmark on the landing page, pastes it into
  their agent's chat (claude.ai in a browser, a terminal session, anything with a browser
  tool), and the agent plays that benchmark and reports its score.
- An agent that reaches the domain on its own, or is told "go to play.helloai.com and pick a
  game", finds the protocol in one hop from any page.
- A human or an agent that finishes a run sees how it ranks against the official board,
  in that browser or in that chat, without anything being sent to the server.
- The official board stays exactly as it is: run files in the repo, replayed by
  `tools/verify.mjs`, committed and deployed by the maintainer.

## Non-goals (deferred, not rejected)

- Score submission from the site. Runs still reach the board by pull request.
- Playing over HTTP without a browser. The games run in JavaScript and the host is a shared
  PHP server, so nothing runs server-side. `tools/agents/bridge.mjs` remains the answer for
  agents without a browser tool: clone the repo and play through a local endpoint.
- Any new server code. `api/views.php` stays the only server endpoint.
- Accounts, initials, cookies, or anything that identifies a visitor to the server.

## Anti-goals

- An unverified score ever appearing in the official rows, or being mistakable for one.
- Changing a benchmark's rules, seed, scoring, recorder or replay. Existing run files must
  keep verifying unchanged.
- A copied prompt that pushes an agent toward writing a solver. The default prompt asks for
  the model's own play from the text board; code is an explicit choice the human makes.

## What exists already (build on it, do not duplicate)

- `games/arcade.js`: the `window.arcade` API (`info`, `observe`, `act`, `run`), the
  recorder, the banner shown on benchmark pages with the score to beat, the "Download run
  (JSON)" button at the end of a turn-based run, and `saveBest()`, which stores the
  browser's best score per `(game, bench, seed, mode)` in `localStorage` under
  `arcade.best.<game>.<bench>.<seed>.<turn|realtime>`.
- `index.html`: the scoreboard reads `data/runs/index.json`, and `renderBench()` already
  merges the browser's best into each benchmark's table as "You · real time" and "You ·
  turn-based" rows, ranked by score, marked "this browser", with a "not played yet" row
  when there is none. The `#agents` section shows a Playwright sample and links to
  `agents.md`.
- `agents.md`: protocol, actions per game, a minimal Playwright agent, the bridge, "Submit a
  run", disclosure rules for Night Shift.
- `llms.txt`: short index with links to `agents.md`, benchmarks, scoreboard and games.
- Game pages load `../arcade.js` (three of them also `../views.js`); none links `agents.md` from
  its head. Block Drop's head also pulls Tailwind and Google Fonts; the other three are bare.

So the "two-layer scoreboard" from the conversation is already in place for browsers. This
design adds the hand-offs around it and fills the gaps listed below.

## The parts

### 1. "Copy for your agent" on every benchmark

Each benchmark block on the landing page (`renderBench()`, the `.bench-side` controls) gains
a third control, `Copy for your agent`, next to `Play` and `Turn-based`. Clicking it copies a
prompt to the clipboard and, as a fallback and for inspection, reveals the same text in a
read-only block under the benchmark head so it can be selected by hand where the clipboard
API is blocked. The button's label changes to `Copied` for two seconds.

The `#agents` section gets the same control for the first benchmark, with a one-line
explanation above it: "Paste this into your agent's chat. It works in claude.ai, a terminal
session, or any agent with a browser tool."

The prompt is generated in `index.html` from `data/runs/index.json`'s benchmark entries
(title, game, bench, seed, rules) and a small per-game table of action hints that lives next
to `GAMES` in the landing page script. Template, with Block Drop as the example:

```
Play Block Drop: Sprint 40 on play.helloai.com for me and report the score.

1. Open https://play.helloai.com/games/block-drop/?agent=1&seed=20261022&bench=sprint-40
   in a browser you control. It is turn-based: nothing moves until you act.
2. The page exposes window.arcade. arcade.observe() returns the board as text plus the
   legal moves; arcade.act("place R C") applies one move and returns the new board;
   when observe().over is true, arcade.run() returns the recorded run.
3. Rules: The same 40 pieces for everyone (seed 20261022). Highest score wins; topping
   out ends the run early. Agents play turn-based, with no gravity and all the time they want.
4. Play from the text board, one decision per piece, without writing a solver unless I
   ask for one. The protocol, with every action, is at https://play.helloai.com/agents.md.
5. When the run is over, tell me the final score and stats, say in one line how you
   played (text board, code you wrote, or screenshots) and how many attempts it took,
   and keep the JSON from arcade.run() so I can submit it to the scoreboard.

No browser tool? Clone https://github.com/do360now/helloai-gamez and follow "No browser?"
in agents.md.
```

Per-game action hints replace the `arcade.act("place R C")` phrase and the "one decision
per piece" phrase: Color Stack `place R C` (cycle R, column C), Pill Drop `place R C`
(orientation R, column C), Night Shift `act("look at board")` with "one command per turn,
150 commands" and an added line: "Say whether you played blind (text only) or open-book
(you read the source or world data); the run needs player.disclosure."

Builder's call: exact wording may be tightened, but the five numbered steps, the rules text,
the "without writing a solver unless I ask" sentence, the report-back sentence, and the
no-browser footer are required.

Decisions (mine, after the builder check):

- The URL's origin is `location.origin` when the page is served over http or https, so a
  maintainer testing from `localhost:8765` sends their agent to the local copy and exercises
  the end-of-run report before it ships; on any other scheme it falls back to
  `https://play.helloai.com`.
- The rules text is the whole `rules` string from `benchmarks.json`, untrimmed. Night Shift's
  rules already end with the disclosure sentence; the extra Night Shift line is still added,
  since the rules describe the run and the line tells the agent what to say.
- Night Shift's URL takes no `agent=1` (the page is always turn-based, as `agents.md` says);
  every other game's does.

### 2. Discovery: one hop from any page to the protocol

- Every game page's `<head>` gains `<link rel="alternate" type="text/markdown"
  href="/agents.md" title="Agent protocol">` and a `<meta name="description">` that names
  the game and says agents should read `/agents.md` and open the page with `?agent=1`.
- `agents.md` opens with a short section, before the current first heading, titled
  "If you are an agent, start here", of at most eight lines: what the site is, the four
  benchmarks with their agent URLs, where the actions are described, what to do when the run
  ends (section 3 below), and the no-browser path.
- `agents.md` gains a section "After the run" (what to report to the human, what to keep,
  how a run reaches the board) and renames the existing bridge paragraph into a section
  "No browser?" with the clone-and-run steps, including that the bridge needs the repo served
  locally (`npm run serve` in `tools/`) and a free port.
- `llms.txt` lists each benchmark with its full agent URL on its own line, and says that
  every benchmark on the landing page has a copyable prompt.
- A `robots.txt` at the root allowing everything and naming `/llms.txt` and `/agents.md`
  in comments, so crawlers and agents that start there find the protocol.
- The deploy script's `LOCAL_ONLY` list is unchanged; `robots.txt` is a site file and
  ships with the rest.

### 3. A clear end of run for agents

When `observe().over` is true, the observation gains a `report` object:

```
report: {
  score, stats,
  leader: { name, score } | null,      // best official run for this benchmark, if loaded
  say: "Run over: 4,750 points, 15 lines, 40 pieces. The official best is 4,686 (Claude Opus 5.5). Tell your human the score and how you played, and keep arcade.run() to submit it: /agents.md#after-the-run"
}
```

`report` is added by `snapshot()` in `games/arcade.js`, is absent while the run is live,
never changes `text`, `score`, `stats`, `actions` or `run()`, and so cannot affect replay or
verification. The leader comes from the same `index.json` fetch the banner already does;
the fetch result is kept where `snapshot()` can read it. If the fetch failed or has not
returned, `leader` is `null` and `say` omits the official-best sentence.

The banner at the end of a turn-based run also shows the personal layer: `saveBest()` runs
before the `over` event, so it records the previous best as it writes, and the banner shows
"new best" when this run set the record and otherwise "your best 3,912" with the previous
record. Nothing is shown during a replay.

The banner's `leader` is today a local variable ranked by score only. It is hoisted so
`snapshot()` can read it, and ranked the way the landing page ranks: score first, then the
benchmark's `tiebreak` stat (lower wins) when both runs have it.

### 4. Landing page copy

The `#scoreboard` lede already says "Your own best stays in this browser." Add one sentence
to the `#agents` lede: "Bring your own: copy a benchmark's prompt below and paste it into
your agent." No other copy changes.

## Constraints

- No build step, no dependencies: plain HTML, CSS and ES5-style scripts in `index.html` and
  `games/arcade.js`, matching the existing files.
- Serve from a local web server when testing (`cd tools && npm run serve` on port 8765);
  pages fetch `/data/runs/index.json`.
- Ports 8770 through 8783 may be held by stray servers on the maintainer's machine; the
  bridge takes `--port`.
- `node tools/verify.mjs` must still pass for every run in `data/runs` after the change.
- `node --test tools/test/*.test.mjs` must still pass.
- Stage files explicitly (`git add <paths>`); other sessions write into this tree.
- `docs/` is kept off the docroot by `deploy.sh`; nothing in this design needs to be served
  from it.

## Acceptance

1. On the landing page, each benchmark shows `Copy for your agent`; clicking copies the
   prompt and reveals it; the Block Drop prompt contains its agent URL, the rules sentence
   from `benchmarks.json`, the "without writing a solver unless I ask" sentence and the
   no-browser footer; the Night Shift prompt contains the disclosure line.
2. Pasting the Block Drop prompt into a Claude Code session with Playwright available
   produces a completed 40-piece run and a report with score and stats, with no further
   instruction from the human. (Manual check by the maintainer; record the outcome in the
   pull request.)
3. `curl` of each game page shows the `agents.md` alternate link and the description meta.
4. `agents.md` starts with "If you are an agent, start here", and has "After the run" and
   "No browser?" sections. `llms.txt` lists four agent URLs. `robots.txt` exists.
5. In a turn-based benchmark page, after the last move, `arcade.observe().report.say`
   contains the score and, when `index.json` loaded, the official best; before the last move
   `report` is undefined. The banner reads "new best" after a record and "your best N"
   otherwise.
6. `node tools/verify.mjs` reports `ok` for all 14 existing runs; `npm test` in `tools`
   passes.

## Left to the builder

- Exact CSS for the revealed prompt block and the `Copied` state, in the landing page's
  existing style (mono, `--line` borders, lime for the active state).
- Whether the prompt-building function lives inline in `index.html` or in a small
  `games/prompt.js` loaded by the landing page. Inline is fine; a separate file is only worth
  it if a Node test wants to import it.
- The precise wording of `report.say` and the `agents.md` additions, within the required
  content above.
- How to test `report` and the copy control: a Playwright script in `tools/test` that serves
  the repo on an ephemeral port is acceptable, as is a documented manual check if adding
  Playwright to the test run proves awkward. Say which was done.
