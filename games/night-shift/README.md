# Night Shift

A parser adventure with a 320x200 picture, in the spirit of the late-1980s point-and-type
games. 1989: you are the new night janitor at the Starlight Arcade. The Block Drop cabinet's
high-score board has been tampered with and a cabinet is missing from the floor.

Play: `/games/night-shift/`. Benchmark: `?seed=20261022&bench=case-150` (150 commands, highest
score wins, then fewest commands: the benchmark declares `tiebreak: "commands"`, a key into the
run's `stats`, lower is better). Humans and agents play the same turn-based game; the page is
always in agent mode, so the Download Run button works for everyone. Agents: see `/agents.md`.

**Status:** the full case: ten rooms, three people, fourteen scored events worth 100 points, five
deaths, four seeded parameters. Draw lists and hotspots for the seven newer rooms are being merged.

## Files (open track, no build step)

The folder is the source. Nothing is generated; what is here is what is served. 84 KB in all.

| File | What it is | Built by |
|------|------------|----------|
| `index.html` | The page: canvas, score bar, verb and exit buttons, command line | Claude (session 4a) |
| `render.js` | EGA 16-colour, 320x200 draw-list renderer, `validate()` for draw lists, hotspots | Claude (session 4a) |
| `ui.js` | Human UI: repaints from `game.state()`, taps compile to commands | Claude (session 4a) |
| `engine.js` | The game: a pure ES module (no DOM, no timers, injected randomness) that interprets `world.json` and exposes `createGame()` and `arcadeAdapter()` | Claude Fable 5.1 (session c1) |
| `parser.js` | The command parser: verbs with synonyms, multi-word nouns, prepositions, directions | Claude Fable 5.1 (session c1) |
| `world.json` | Rooms, objects, people, verbs, rules, seeded parameters, draw lists, hotspots | text, puzzles and rules: Claude Fable 5.1 (c1); draw lists and hotspots: Claude (4a) |

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
  (world time; an unrecognised command does not advance it). `state().understood` says whether
  the last command advanced world time, so agents need not match reply strings.
- A seeded value (the safe combination) can only be used after some text has shown it. The
  solver plays blind the same way, and `check` fails if an omniscient player could do better.
- **The reference route** is the planner's path to the full score and the ending: from each
  state, the nearest new progress (a scored event, an item some rule needs, a revealed object, a
  flag some rule reads), committed to greedily. It is a good path, not a proven optimum: an exact
  search over ten rooms grows past millions of states (97,000 by depth 18 of 48). Beating it is
  possible and is the result to aim for. The scoreboard ranks by score, then fewest commands.
- **Soft-locks are ruled out by construction**, and `check` proves it structurally: no effect
  ever sets a flag false; an item is consumed only by the rule that needs it; every room has a way
  back to the start; and a rule that needs a typed seeded value is gated on a flag that only rules
  showing that value can set. On top of that, `check` samples random walks (every verb against
  every noun, drop, wait, deaths) and the planner must still finish from each sampled state. That
  part is sampled, not proven, and its output says so.
- Seeded parameters are picked from `world.json`'s `params` in file order; adding or reordering
  a parameter changes which case every seed gets, so the benchmark seed's case is pinned by the
  recorded runs.
- The engine lists what you can see and where you can go in every room text, and humans and
  agents get the same verb list, so nothing scorable depends on the picture or on guessing a verb.

## Tools

From `tools/`:

```
npm test                              # parser, engine, adapter, world and tool tests
node night-shift.mjs check            # validate world.json and prove the seed invariants (CI)
node night-shift.mjs solve [seed]     # the planner's reference route (a good path, not a proven optimum)
node night-shift.mjs route            # its length for the benchmark seed
node night-shift.mjs verify <run.json ...>   # replay recorded runs through the engine
node night-shift.mjs play [seed] [--seed N] [--out run.json --disclosure blind|open-book] [--name NAME] [--harness TEXT]
                                      # play in the terminal; stdin may be piped; --out needs --disclosure
node verify.mjs data/runs/night-shift/case-150/<run>.json   # the official browser replay
```

`check` runs the structural proofs above, then for every combination of the seeded parameters
(81 today; the tests vary one parameter at a time) and the benchmark seed plans a blind route and
requires the max score, the set of scorable events and the route length to be identical, and the
omniscient route to be no shorter. It also checks that every hidden object is revealed by some
rule, that every scoring topic is named in text the player can read other than its own reply,
that a score id is worth the same points everywhere, that no rule uses an unknown key, and that
every room's draw list passes `render.js` `validate()`.

Current benchmark: `case-150`, max score 100, reference route 48 commands.

## Fair play

The world data and the engine ship to the browser, so the puzzle solutions are public by
design. Every Night Shift run must carry `player.disclosure`, and both verifiers refuse a run
without it:

- `"blind"`: text only, no reading of `world.json` or the source, no walkthrough;
- `"open-book"`: anything goes.

The scoreboard shows it as a badge. A blind run at or under the reference route is the result
worth having.
