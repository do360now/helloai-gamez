import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, normalize, DIRECTIONS } from "../../games/night-shift/parser.js";

const verbs = [
  { verb: "look", synonyms: ["l", "look at", "examine", "x", "inspect"], args: 1, preps: [], usage: "look | look at <object>", optional: true },
  { verb: "take", synonyms: ["get", "pick up", "grab"], args: 1, preps: [], usage: "take <object>" },
  { verb: "use", synonyms: [], args: 2, preps: ["on", "with", "in"], usage: "use <object> on <object>" },
  { verb: "put", synonyms: ["insert"], args: 2, preps: ["in", "into", "on"], usage: "put <object> in <object>" },
  { verb: "ask", synonyms: [], args: 2, preps: ["about"], usage: "ask <person> about <topic>", topic: true },
  { verb: "inventory", synonyms: ["i", "inv"], args: 0, preps: [], usage: "inventory" },
  { verb: "go", synonyms: ["walk", "run"], args: 1, preps: [], usage: "go <direction>" },
];
const nouns = [
  { id: "mop", nouns: ["mop"] },
  { id: "board", nouns: ["high score board", "board", "scores"] },
  { id: "officedoor", nouns: ["door", "office door"] },
  { id: "officekey", nouns: ["key", "office key", "brass key"] },
  { id: "safekey", nouns: ["key", "safe key"] },
  { id: "token", nouns: ["token"] },
  { id: "cabinet", nouns: ["cabinet", "block drop"] },
  { id: "marge", nouns: ["marge", "owner"] },
];
const oneKey = nouns.filter((n) => n.id !== "safekey");

test("normalize lowercases, strips punctuation and articles", () => {
  assert.equal(normalize("  Look AT the  Mop!"), "look at mop");
});

test("parses bare verb", () => {
  assert.deepEqual(parse("inventory", verbs, nouns), { verb: "inventory" });
  assert.deepEqual(parse("I", verbs, nouns), { verb: "inventory" });
  assert.deepEqual(parse("look", verbs, nouns), { verb: "look" });
});

test("parses verb synonym with object", () => {
  assert.deepEqual(parse("pick up the mop", verbs, nouns), { verb: "take", object: "mop" });
  assert.deepEqual(parse("x mop", verbs, nouns), { verb: "look", object: "mop" });
});

test("parses two-argument verb with preposition", () => {
  assert.deepEqual(parse("use key on door", verbs, oneKey), { verb: "use", object: "officekey", target: "officedoor" });
  assert.deepEqual(parse("insert the token into the cabinet", verbs, nouns), { verb: "put", object: "token", target: "cabinet" });
});

test("parses ask about with a free topic", () => {
  assert.deepEqual(parse("ask marge about the cabinet", verbs, nouns), { verb: "ask", object: "marge", topic: "cabinet" });
  assert.deepEqual(parse("ask owner about high scores", verbs, nouns), { verb: "ask", object: "marge", topic: "high scores" });
});

test("parses directions with and without go", () => {
  assert.deepEqual(parse("n", verbs, nouns), { verb: "go", dir: "north" });
  assert.deepEqual(parse("go north", verbs, nouns), { verb: "go", dir: "north" });
  assert.deepEqual(parse("walk out", verbs, nouns), { verb: "go", dir: "out" });
  assert.equal(DIRECTIONS.u, "up");
});

test("parses multi-word nouns, longest match first", () => {
  assert.deepEqual(parse("look at high score board", verbs, nouns), { verb: "look", object: "board" });
  assert.deepEqual(parse("examine office door", verbs, nouns), { verb: "look", object: "officedoor" });
});

test("unknown verb error", () => {
  assert.deepEqual(parse("frobnicate mop", verbs, nouns), { error: "verb", word: "frobnicate" });
});

test("unknown noun error carries the word", () => {
  assert.deepEqual(parse("take the banana", verbs, nouns), { verb: "take", error: "noun", word: "banana" });
});

test("ambiguous noun error carries both ids", () => {
  assert.deepEqual(parse("take key", verbs, nouns), { verb: "take", error: "ambiguous", word: "key", ids: ["officekey", "safekey"] });
});

test("missing object error when a verb needs one", () => {
  assert.deepEqual(parse("take", verbs, nouns), { verb: "take", error: "missing" });
  assert.deepEqual(parse("use key", verbs, oneKey), { verb: "use", object: "officekey", error: "missing" });
});

// Review fixes: trailing words after a noun, a direction after look, and a typed code.
test("trailing words after a known noun are dropped", () => {
  const turn = [{ verb: "turn", synonyms: ["flip"], args: 1, preps: [], usage: "turn <object>" }];
  const photo = [{ id: "photo", nouns: ["photo", "framed photo"] }];
  assert.deepEqual(parse("turn photo over", turn, photo), { verb: "turn", object: "photo" });
  assert.deepEqual(parse("turn the framed photo around", turn, photo), { verb: "turn", object: "photo" });
  assert.deepEqual(parse("turn the fish over", turn, photo), { verb: "turn", error: "noun", word: "fish" });
});

test("a direction after a one-argument verb parses as dir", () => {
  assert.deepEqual(parse("look north", verbs, nouns), { verb: "look", dir: "north" });
  assert.deepEqual(parse("look at the east", verbs, nouns), { verb: "look", dir: "east" });
});

test("a number after the noun, or in the second slot, is a code", () => {
  const vs = verbs.concat([
    { verb: "open", synonyms: [], args: 1, preps: [], usage: "open <object>" },
    { verb: "turn", synonyms: [], args: 1, preps: [], usage: "turn <object>" },
    { verb: "unlock", synonyms: [], args: 2, preps: ["with", "using"], usage: "unlock <object> with <object>" },
  ]);
  const ns = nouns.concat([{ id: "safe", nouns: ["safe", "dial"] }]);
  assert.deepEqual(parse("open safe with 0451", vs, ns), { verb: "open", object: "safe", code: "0451" });
  assert.deepEqual(parse("turn dial to 0451", vs, ns), { verb: "turn", object: "safe", code: "0451" });
  assert.deepEqual(parse("unlock safe with 0451", vs, ns), { verb: "unlock", object: "safe", code: "0451" });
  assert.deepEqual(parse("open safe", vs, ns), { verb: "open", object: "safe" });
  assert.deepEqual(parse("open safe with crowbar", vs, ns), { verb: "open", object: "safe", error: "noun", word: "crowbar" });
  assert.deepEqual(parse("open door with key", vs, oneKey), { verb: "open", object: "officedoor", target: "officekey" });
  assert.deepEqual(parse("open door with the brass key", vs, ns), { verb: "open", object: "officedoor", target: "officekey" });
});
