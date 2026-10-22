# Night Shift: content design for the full case (100 points)

Spoilers: this file holds every puzzle and the solution. Builders and reviewers only. Player1
and other blind testers must not read it. `docs/` is excluded from deploy.

Builds on the three-room slice (floor, prize counter, back office; 45 points). Engine, schema and
invariants: `2026-10-22-night-shift-design.md`. Agreed rules the content must honour: the solver
plays blind (a seeded value is only usable after text shows it), every seed has the same max
score, scorable events and par; everything scorable is discoverable from text; no turn timers
(the solver does not model time yet).

## The story

1989, the Starlight Arcade, two in the morning. The Block Drop high-score board shows a fake
top entry (ZZZ, 999,999, entered 3:07) and the Galaxy Patrol cabinet is gone. The ledger says a
pickup was signed at 2:50 with a loop of a signature.

**What happened.** Rudy, the repair tech, sold the Galaxy Patrol cabinet to a collector. He used
one of the pickup slips Dale (the delivery driver) leaves pre-signed with him for dead cabinets,
so the ledger looks like a legitimate pickup in Dale's hand. He dismantled the cabinet in the
stockroom (sawing off the back panel that carries Marge's inventory tag), dollied it to the dock,
and loaded it into Dale's van with Dale's fob, which lives in the clipboard pouch. Dale himself
has been asleep on a stool in the diner since one. At 3:07 Rudy used the Block Drop panel key,
which he had borrowed from Marge's ring last week and never returned, to type a vandal-looking
entry into the board so the night would read as a break-in by kids. He hid the panel key in a
drawer in his basement workshop, meaning to slip it back on the ring in the morning. At 3:15 he
walked into the diner for coffee, hands smelling of solder, and asked Lou for change for the
payphone, from which he called the collector.

**The ending.** With the panel key in hand and the collector's answering machine heard, the
player accuses Rudy in front of Marge. Marge calls the police, the sun comes up, and the
janitor is told the floor still needs vacuuming.

## Rooms (10)

| id | name | exits |
|----|------|-------|
| floor | Arcade floor | north office (locked), east counter, west hallway |
| counter | Prize counter | west floor, in stockroom (grille, padlocked) |
| office | Back office | south floor |
| hallway | Back hallway | east floor, north dock, down workshop |
| dock | Loading dock | south hallway, out alley |
| alley | Alley | in dock, west diner, enter van (locked) |
| van | Inside the van | out alley |
| diner | Starlight Diner, back counter | east alley |
| workshop | Basement workshop | up hallway |
| stockroom | Stockroom | out counter |

## People (3)

- **Marge** (office): owner. Topics as in the slice, plus Lou, Dale, the ring, the padlock, the
  accusation.
- **Lou** (diner): night cook. Topics: Dale (asleep since one: alibi), Rudy (came in at 3:15,
  solder on his hands, wanted change for the payphone), the phone, the quarter, the van, Marge,
  the cabinet, Priya (a regular, came by for pie at eleven, went home), coffee.
- **Dale** (diner, asleep): mumbles. Ask about slips: "Rudy keeps 'em... for the dead ones...";
  ask about the van: "fob's on the clipboard... don't wake me".

## Seeded parameters

- `combo`: 1989 | 0451 | 2600 (slice).
- `keyLocker`: locker1 | locker2 | locker3 (slice).
- `witness`: who Marge names (slice; flavour).
- `drawer` (new): drawer1 | drawer2 | drawer3, which workshop drawer holds the panel key. The
  other two hold flavour. The drawer tag "BD" is on the right one in text (so it is discoverable:
  "look at drawers" lists the tags; the tagged one is `${drawer}`).

## Point table (100)

| id | event | points | where |
|----|-------|--------|-------|
| notice-board | look at the board | 5 | floor |
| find-token | find the token under the cabinet | 5 | floor |
| service-mode | token in the cabinet: service page | 10 | floor |
| read-ledger | read the ledger | 5 | counter |
| unlock-office | unlock the office door | 10 | floor |
| open-safe | open the safe with the typed combination (after the photo) | 10 | office |
| read-clipboard | read Dale's clipboard: pre-signed slips, same loop as the ledger | 5 | dock |
| see-label | inside the van: the wrapped cabinet and the collector's label | 5 | van |
| lou-dale | Lou: Dale has been asleep here since one | 5 | diner |
| lou-rudy | Lou: Rudy at 3:15, solder, change for the phone | 5 | diner |
| phone | quarter in the payphone, redial: the collector's machine | 10 | alley |
| panel-key | the Block Drop panel key in the tagged drawer | 10 | workshop |
| back-panel | the sawn-off back panel with the inventory tag | 5 | stockroom |
| accuse | accuse Rudy to Marge with the key and the call | 10 | office |

## Dependency chart

```
floor: look board (5) ─┐
floor: search cabinet → token (5) → put token in cabinet (10)
counter: read ledger (5)
counter: open ${keyLocker} → brass key → floor: unlock office (10) → office
office: turn photo → ${combo} → open safe with ${combo} (10) → ring (take)
counter: unlock grille with ring → stockroom: look back panel (5)
hallway → dock: read clipboard (5), search clipboard → fob
dock → alley: unlock van with fob → enter van: look label (5)
alley → diner: ask lou about dale (5), ask lou about rudy (5), search stool → quarter
diner → alley: put quarter in payphone, press redial (10)         [needs quarter]
hallway → workshop: look drawers (tags), open ${drawer} → panel key (10)
office: accuse rudy (10) [requires: has panelkey, flag phoneHeard] → WIN
```

Nothing is gated on a scored event except: the office (brass key), the safe (photo), the
stockroom (ring from the safe), the van (fob from the clipboard), the phone (quarter), the
accusation (panel key and phone). Order between branches is free.

## Deaths (5 total, each 5 points, rewind)

- pull/take the frayed cord (slice), drink the slush (slice)
- dock: pull the lift lever (the dock plate drops with you on it)
- alley: climb into the dumpster (the 4 a.m. truck)
- workshop: touch the open monitor chassis (the CRT's charge)

## Red herrings (free)

- Marge's seeded witness line.
- Priya: on the board, in Marge's and Lou's lines; never present.
- The slush, the register, the fuse box, the poster.

## Verbs added

`accuse <person>`; `enter <object>` already exists (enter van).

## Par

The solver decides. Expected around 40 commands.

## Text rules

Every scored object is listed in its room by the engine. Every scored topic appears in some
text the player can read (the solver checks). The combination appears only on the back of the
photo; the drawer tag appears only in the drawers' text. The collector's message names Rudy.
