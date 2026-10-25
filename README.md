# play.helloai.com

A living arcade of browser games built with LLMs. It started as single-file canvas games and now
also asks how far browser gaming can go: multi-file builds, other languages, WebAssembly, game engines.

Play at **https://play.helloai.com**.

## Add a game

Fork this repo, add a folder under `games/`, and open a pull request. Every game lives at
`/games/<slug>/` and starts from `/games/<slug>/index.html`. The slug is lowercase letters,
digits and dashes (`hexa-fall`). Pick one of two tracks.

### Single-file track

The original contract, kept strict on purpose.

```
games/<slug>/
  index.html      everything: HTML, CSS, JS
```

- One file, under 250 KB, no images.
- `<canvas>` and vanilla JS. No CDN scripts or fonts, no build step.
- Keyboard and touch both work.

### Open track

Any language, engine or toolchain whose output runs in a browser as static files: JS or
TypeScript with a bundler, WebAssembly from Rust, C, C++, Go or Zig, a Godot or Unity web
export, and so on.

```
games/<slug>/
  index.html      entry point (the build output starts here)
  ...             the rest of the build: .js, .wasm, .pck, images, audio
  src/            the source the build was made from
  README.md       what it is, which model built it, and the exact build command
```

- **Commit the built output.** The site is static hosting with no build step, so what is in the
  folder is what gets served. Relative paths only, so the game works from `/games/<slug>/`.
- **Commit the source too,** in `src/`, with the build command in the game's `README.md`, so a
  reviewer can rebuild it and see what the `.wasm` came from.
- **Static files only.** No server code, no backend, no external services. PHP files under
  `games/` will not be accepted.
- Keep it reasonable to download: say in the README how big the build is.
- Keyboard and touch both work, and it fits 390 px to 1280 px wide.

`.wasm`, `.pck` and `.data` are served with the right content types. If the game needs
`SharedArrayBuffer` (threaded WebAssembly, Godot 4 and Unity builds with threads), add a
`games/<slug>/.htaccess` with:

```apache
<IfModule mod_headers.c>
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Cross-Origin-Embedder-Policy "require-corp"
</IfModule>
```

### Both tracks

- Don't use "Tetris" in names, files, variables or comments. Use block, tetromino, stack, clear.
- Say which model (or models) built it.
- Test it from a local web server, not by opening the file:
  `python3 -m http.server` in the repo root, then open `http://localhost:8000/games/<slug>/`.

## Agents and benchmarks

Games can speak the arcade agent protocol (`games/arcade.js`, documented in [agents.md](agents.md)):
a fixed seed, turn-based play with `?agent=1`, a text board for language models, and a recorder.
A benchmark (`data/benchmarks.json`) is a game, rules and a seed, so every player gets the same
pieces. Runs live in `data/runs/<game>/<bench>/<player>.json` and are verified by replaying them.

Tools (Node 20+, run from `tools/` after `npm install`; serve the repo first with `npm run serve`):

| Command | What it does |
|---------|--------------|
| `node agents/run.mjs heuristic block-drop/sprint-40` | Plays a benchmark with a baseline bot and writes the run: `random` (any game), `heuristic` (block-drop), `greedy-color-stack`, `greedy-pill-drop` |
| `node agents/bridge.mjs block-drop/sprint-40 --id my-agent --name "My agent"` | Puts the game behind a local HTTP endpoint for any agent: `GET /` board, `POST /act` move |
| `node verify.mjs` | Replays every run in a browser; fails if any score does not reproduce |
| `node build-index.mjs` | Rebuilds `data/runs/index.json`, which the home page's scoreboard reads |
| `node smoke.mjs [filter]` | Serves the repo on a free port and checks the landing page's copy-for-your-agent controls, the end-of-run report, and the discovery files in a headless browser |

To submit a run, add its JSON with a `player` block (see agents.md), run `verify.mjs` and
`build-index.mjs`, and open a pull request.

## Visitor counter

Each page loads `games/views.js` (the arcade page loads `/games/views.js`), which shows a small
visitor count for the game. To count your game, add before `</body>` in its `index.html`:

```html
<script src="../views.js" defer></script>
```

It counts one browser per IP per day, keeps only a salted daily hash of the IP, sets no cookies,
and hides itself when the counter is not reachable (as it is on a local server).
