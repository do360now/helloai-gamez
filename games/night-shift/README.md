# Night Shift

A parser adventure with a 320x200 picture, in the spirit of the late-1980s point-and-type
games. 1989: you are the new night janitor at the Starlight Arcade. The Block Drop cabinet's
high-score board has been tampered with and a cabinet is missing from the floor.

Play: `/games/night-shift/`. Benchmark: `?seed=20261022&bench=case-150` (150 commands, highest
score wins, then fewest commands). Humans and agents play the same turn-based game; the page is
always in agent mode, so the Download Run button works for everyone. Agents: see `/agents.md`.

**Status:** a playable three-room slice (45 of the planned 100 points). The rest of the rooms,
puzzles and people come next.

## Files (open track, no build step)

The folder is the source. Nothing is generated; what is here is what is served. 84 KB in all.

| File | What it is | Built by |
|------|------------|----------|
| `index.html` | The page: canvas, score bar, verb and exit buttons, command line | Claude (session 4a) |
| `render.js` | EGA 16-colour, 320x200 draw-list renderer, `validate()` for draw lists, hotspots | Claude (session 4a) |
| `ui.js` | Human UI: repaints from `game.state()`, taps compile to commands | Claude (session 4a) |
| `engine.js` | The game: a pure ES module (no DOM, no timers, injected randomness) that interprets `world.json` and exposes `createGame()` and `arcadeAdapter()` | Claude Fable 5.1 (session c1) |
| `parser.js` | The command parser: verbs with synonyms, multi-word nouns, prepositions, directions | Claude Fable 5.1 (session c1) |
| `world.json` | Rooms, objects, people, verbs, rules, seeded parameters, draw lists, hotspots | text and rules: Claude Fable 5.1 (c1); draw lists and hotspots: Claude (4a) |

All text, art and rules are original. The classics were studied for structure only.

## How it works

- Every command is one logged action. A run file is a transcript, and the game replays it.
- `world.json` is declarative: rules say `when` (verb, object, target or topic), `require`
  (room, items held, flags, seeded parameter) and `do` (reply, flag, score, move, reveal, exit,
  die, win). Points come from engine-checked state changes, never from phrases, and each
  scoring id counts once.
- Seeded parameters (which locker holds the key, the safe combination, the witness Marge names)
  are picked from `Arcade.random()` so every player on a seed gets the same case.
- Deaths play the whole death message, cost 5 points, and rewind to before the fatal command.
  They never end the run.
- Two counters: `commands` (every logged command, what the 150 budget counts) and `moves`
  (world time; an unrecognised command does not advance it).
- The engine lists what you can see and where you can go in every room text, and humans and
  agents get the same verb list, so nothing scorable depends on the picture or on guessing a verb.

## Tools

From `tools/`:

```
npm test                              # parser, engine, adapter, world and tool tests
node night-shift.mjs check            # validate world.json and prove the seed invariants (CI)
node night-shift.mjs solve [seed]     # the optimal command list and par
node night-shift.mjs verify <run.json ...>   # replay recorded runs through the engine
node night-shift.mjs play [seed]      # play in the terminal
node verify.mjs data/runs/night-shift/case-150/<run>.json   # the official browser replay
```

`check` asserts, for the benchmark seed and four others, that the full score is reachable,
that the max score, the set of scorable events and par are identical, that every hidden object
is revealed by some rule, that every scoring topic is named in text the player can read, and
that every room's draw list passes `render.js` `validate()`.

Current benchmark: `case-150`, max score 45 (slice), par 13 commands.

## Fair play

The world data and the engine ship to the browser, so the puzzle solutions are public by
design. A run's `player.harness` and `player.notes` say how it was played, and the scoreboard
shows the category:

- **blind:** text only, no reading of `world.json` or the source, no walkthrough;
- **open book:** anything goes.

A blind run near par is the result worth having.
