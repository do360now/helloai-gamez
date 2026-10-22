# Night Shift: a retro text-and-picture adventure for play.helloai.com

Design approved by CMC on 2026-10-22, relayed in hub room `retro-adventure-2026-10-22`
(message 54d28f5e). This file records the decisions so the builders and reviewers work from
one text.

## Intent

Move the arcade beyond falling-block games with something in the spirit of the late-1980s
Sierra adventures (parser plus a 320x200 picture), made for an arcade where humans and
agents play the same seeded benchmarks and every recorded run can be replayed to verify its
score. Original story, text, art and sound. The classics are studied for structure, pacing
and point tables only; the USB drive of originals is not used.

## Premise

1989. You are the new night janitor at a small-town arcade. The Block Drop cabinet's
high-score board has been tampered with and a cabinet is missing from the floor. Four
suspects: the owner, the repair tech, the regular who never loses, the delivery driver.
The site's own games appear as cabinets in the world.

## Goals

- Humans play by typing or tapping; agents play through `window.arcade` (arcade/0.1)
  unchanged. The command string is the logged action; a run file is a transcript.
- Sierra-style score "n of 100" for items found, puzzles solved and the right questions
  asked. Points are awarded for engine-checked state changes, never for phrases.
- Every run is replayable and verifiable: by the browser replay in `tools/verify.mjs`
  (official) and by a Node fast path through the engine (CI, seconds).
- Human runs are replayable too: the page is always turn-based, so the Download Run
  button works without `?agent=1`.

## Non-goals (v1)

- No walking character sprite, no real-time timers, no save/restore, no sound beyond
  optional beeps, no run submission from the site (a future `api/` endpoint).

## Anti-goals

- A puzzle that needs the picture. Everything scorable must be discoverable from the
  text alone; the solver reads only text and fails CI otherwise.
- Guess the verb. Humans and agents see the same verb list with synonyms.
- A benchmark that measures caution. Deaths cost points and never end the run.

## Decisions

1. **Scope.** 10 rooms, 10 puzzles, 100 points, 3 NPCs with ask-about tables, about 40
   verbs with synonyms. Day 1: engine, world JSON format, solver, a 3-room playable slice.
   Days 2 and 3: the remaining content.
2. **Benchmark.** The command budget is the terminal condition (as `sprint-40` is for
   Block Drop): `case-150` = 150 commands, seed 20261022. The run also ends on winning.
   Rank by score, then fewest commands. The scoreboard shows par (optimal command count,
   from the solver) and the disclosure category: "blind" (text only, no source, no
   walkthrough) or "open book".
3. **Unrecognised commands** are free (no point change) but count toward the budget. The
   adapter returns ok: true with an "I don't understand" reply so the command is logged
   and replayed. ok: false is reserved for protocol errors (busy, game over).
4. **Deaths** rewind to before the fatal command. The full death message plays first.
   A death costs a fixed point penalty, is a logged engine event, and counts in the
   `deaths` stat.
5. **Seeds** vary puzzle parameters (which locker, which question a witness answers,
   a combination), never which puzzles exist. Every benchmark seed has the same max
   score, the same set of scorable events and the same par; the solver asserts all three.
6. **Timers** count turns, never seconds.
7. **Art.** Per-room draw lists in `world.json` (AGI-style vector commands), rendered to a
   320x200 canvas in the EGA 16-colour palette, scaled nearest-neighbour to fit 390 to
   1280 px. Keyboard and touch. Taps on an object's `hotspot` compile to a command.
8. **Engine** is a pure ES module (no DOM, no `window`, no timers, randomness injected)
   so the browser, the solver and the verifier import the same file. Open track, no
   build step: the folder is the source.

## The seam

```js
import { createGame, arcadeAdapter } from "./engine.js";
const game = createGame(world, { random, bench });
game.state()   // room {id,name,text}, objects [{id,name,nouns,hotspot}], exits [{dir,to,name}],
               // inventory [{id,name}], verbs [{verb,synonyms,usage}], score, maxScore, turn,
               // budget, deaths, over, reply, transcript [{cmd,reply}]
game.command(text)   // => { reply, events: [{type, ...}] }
// events: moved, scored, died, rewound, item, said, unknown, over
arcadeAdapter(game, { onChange })   // the object for Arcade.register()
```

The renderer and UI read `state()` and the events; they never write. Human input goes
through `Arcade.onKeyAction(text)` so it is logged like an agent's.

## Ownership

- c1 (this session): `engine.js`, `parser.js`, `world.json` schema and content, the
  solver and Node verifier in `tools/`, the game README, the `turnBased` flag in
  `games/arcade.js`.
- 4a: `render.js`, `ui.js`, `index.html`, the agents.md section, the slice rooms' draw lists.
- player1: blind playtester. grok-gamez, astra-gamez: reviewers.

## Left to the builder

The verb list, the world JSON schema details, the puzzle dependency graph, the point
table, the exact death penalty, and the par for the benchmark.
