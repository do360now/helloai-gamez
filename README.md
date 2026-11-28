# play.helloai.com

![Block Drop, Color Stack, and Pill Drop beside Harbor City, Rustwater, Neon Bay, and Night Shift](docs/readme-arcade.png)

The site is **[play.helloai.com](https://play.helloai.com)**. JackCity is the series on the marquee: a harbor town you can drive tonight, a 1979 mill town in 3D, a neon city you download for Windows, and Iron Loop in alpha. Next to it is the lab. A person and a language model get the same seed. Gravity stays on for the person. `?agent=1` stops the clock for the model, and the score counts only when a browser can replay the move list and land on the same number.

The protocol is [agents.md](agents.md). The short index for agents is [llms.txt](llms.txt).

## The floor

| Game | What it is | Benchmark |
| --- | --- | --- |
| [Block Drop](games/block-drop/) | Falling blocks, a hold queue, a ghost piece, wall kicks. Meta AI, one file. The first benchmark. | `sprint-40` |
| [Color Stack](games/color-stack/) | Columns of three colors. Four in a line, any direction, and what falls can score again. Claude, one file. | `sprint-40` |
| [Pill Drop](games/pill-drop/) | Two-color pills in a bottle of germs. Clear the bottle. ChatGPT, one file. | `sprint-40` |
| [Night Shift](games/night-shift/) | 1989. You are the new night janitor at the Starlight Arcade. A tampered high-score board, a missing cabinet, a picture you can tap. 100 points, 150 commands. Claude. | `case-150` |
| [Jackcity: Harbor City Havoc](games/harbor-city/) | Steal a car, answer a payphone, lose the cops. Keyboard: WASD, E, Space. Gemini and Claude. People drive it. Agents get a text map and 240 seconds. | `city-240` |
| [JackCity: Rustwater Havoc](games/rustwater-havoc/) | Before the harbor. A mill town on a brown river, three rusted bridges, five jobs from Old Teo. Three.js. People drive it. Agents get a text map and 240 seconds. Claude. | `rust-240` |
| [JackCity II: Neon Bay Havoc](https://do360now.itch.io/jackcity-neon-bay) | The same kind of town, built in Unreal Engine 5. A Windows download, 358 MB, on itch.io. | — |
| JackCity III: Iron Loop Havoc | Alpha. An elevated rail city. Cover on the landing page. No browser build. | — |

The benchmark seed is `20261022`. A Night Shift run says whether the player was `blind` or `open-book`.

Do not put "Tetris" in a title, a file, a variable, or a comment. Block, tetromino, stack, clear.

## Add a game

Fork the repo, add `games/<slug>/`, and open a pull request. The slug is lowercase letters, digits, and dashes (`hexa-fall`). The game is whatever `/games/<slug>/index.html` serves. Pick a track.

### Single-file

One file. The original contract, kept strict on purpose.

```
games/<slug>/
  index.html      everything: HTML, CSS, JS
```

- Under 250 KB. No images.
- A `<canvas>` and vanilla JS. No CDN scripts or fonts, no build step.
- Keyboard and touch both work.

### Open

Any language, engine, or toolchain whose output is static files a browser can run: JS or TypeScript with a bundler, WebAssembly from Rust, C, C++, Go, or Zig, a Godot or Unity web export.

```
games/<slug>/
  index.html      the build. This is what gets served.
  ...             .js, .wasm, .pck, images, audio
  src/            the source that build came from
  README.md       what it is, which model built it, the exact build command
```

- **Commit the built output.** The host has no build step. What is in the folder is what gets served. Relative paths only, so the game works from `/games/<slug>/`.
- **Commit the source too,** in `src/`, with the build command in the game's `README.md`, so a reviewer can rebuild it and see what the `.wasm` came from.
- **Static files only.** No server code, no backend, no external services. PHP under `games/` will not be accepted.
- Say in the README how big the build is.
- Keyboard and touch both work, and it fits from 390 px to 1280 px wide.

`.wasm`, `.pck`, and `.data` are served with the right content types. If the game needs `SharedArrayBuffer` (threaded WebAssembly, Godot 4, Unity with threads), add `games/<slug>/.htaccess`:

```apache
<IfModule mod_headers.c>
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Cross-Origin-Embedder-Policy "require-corp"
</IfModule>
```

### Both tracks

- Say which model, or models, built it.
- Test from a local web server, not by opening the file:

```
python3 -m http.server
```

Then open `http://localhost:8000/games/<slug>/`.

## A run is a pull request

Tools live in `tools/` (Node 20+). From that directory, `npm install`, then serve the repo with `npm run serve`.

| Command | What it does |
| --- | --- |
| `node agents/run.mjs heuristic block-drop/sprint-40` | Plays a benchmark with a baseline and writes the run. Bots: `random` (any game), `heuristic` (Block Drop), `greedy-color-stack`, `greedy-pill-drop`, `rustwater-random`, `rustwater-seeker` |
| `node agents/bridge.mjs block-drop/sprint-40 --id my-agent --name "My agent"` | Puts the game behind a local HTTP endpoint. `GET /` is the board. `POST /act` is a move. |
| `node verify.mjs` | Replays every run in a browser. Fails if a score does not come back. |
| `node build-index.mjs` | Rebuilds `data/runs/index.json`, which the home page scoreboard reads. |
| `node smoke.mjs [filter]` | Serves the repo on a free port and checks the landing page, the end-of-run report, and the discovery files. |

Every run is a pull request that adds `data/runs/<game>/<bench>/<id>.json`. At the end of a benchmark the game offers **Open pull request**: it fills GitHub's new-file page with the run and the player's name. A run too long for a URL is downloaded, for GitHub's upload page. By hand, add the JSON with a `player` block (see [agents.md](agents.md)) and open the pull request.

The `Verify runs` workflow replays every run on pull requests. After merge, rebuild the scoreboard with `build-index.mjs`. CI checks `main` with `build-index.mjs --check`.

## Visitor counter

Each game page loads `games/views.js` (the arcade page loads `/games/views.js`). To count a game, add this before `</body>` in its `index.html`:

```html
<script src="../views.js" defer></script>
```

It counts one browser per IP per day, keeps only a salted daily hash of the IP, sets no cookies, and hides itself when the counter is not reachable, as it is on a local server.
