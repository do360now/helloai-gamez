// Night Shift command parser. Pure: no DOM, no state. See ../../docs/superpowers/specs for the design.
//
// parse(text, verbs, nouns) -> {verb, object, target, topic, dir, error, word, ids}
//   verbs: [{verb, synonyms: [..], args: 0|1|2, preps: [..], usage, optional, topic}]
//   nouns: [{id, nouns: [..]}] for everything the player can refer to right now.
//   error is "verb" (unknown verb, word), "noun" (unknown noun, word), "ambiguous" (word, ids) or
//   "missing" (the verb needs another argument). Only the keys that apply are present.

export const DIRECTIONS = {
  north: "north", n: "north", south: "south", s: "south", east: "east", e: "east", west: "west", w: "west",
  northeast: "northeast", ne: "northeast", northwest: "northwest", nw: "northwest",
  southeast: "southeast", se: "southeast", southwest: "southwest", sw: "southwest",
  up: "up", u: "up", down: "down", d: "down", in: "in", inside: "in", out: "out", outside: "out",
  exit: "out", leave: "out",
};

const ARTICLES = new Set(["a", "an", "the"]);

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9' -]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !ARTICLES.has(w))
    .join(" ");
}

function verbPhrases(verbs) {
  const out = [];
  for (const v of verbs) {
    out.push({ v, words: v.verb.split(" ") });
    for (const s of v.synonyms || []) out.push({ v, words: s.split(" ") });
  }
  out.sort((a, b) => b.words.length - a.words.length);
  return out;
}

function startsWith(words, phrase) {
  if (phrase.length > words.length) return false;
  for (let i = 0; i < phrase.length; i++) if (words[i] !== phrase[i]) return false;
  return true;
}

// Resolves a noun phrase to an id. Tries the whole phrase, then drops leading words (adjectives the
// world does not know), so "red mop" finds "mop". Returns {id} | {error, word, ids}.
function resolve(words, nouns) {
  const phrase = words.join(" ");
  for (let start = 0; start < words.length; start++) {
    const sub = words.slice(start).join(" ");
    const ids = [];
    for (const n of nouns) if ((n.nouns || []).includes(sub) && !ids.includes(n.id)) ids.push(n.id);
    if (ids.length === 1) return { id: ids[0] };
    if (ids.length > 1) return { error: "ambiguous", word: sub, ids };
  }
  return { error: "noun", word: phrase };
}

export function parse(text, verbs, nouns) {
  const words = normalize(text).split(" ").filter(Boolean);
  if (!words.length) return { error: "verb", word: "" };

  let match = null;
  for (const p of verbPhrases(verbs)) {
    if (startsWith(words, p.words)) { match = p; break; }
  }
  let rest;
  let v;
  if (match) {
    v = match.v;
    rest = words.slice(match.words.length);
  } else if (words.length === 1 && DIRECTIONS[words[0]]) {
    return { verb: "go", dir: DIRECTIONS[words[0]] };
  } else {
    return { error: "verb", word: words[0] };
  }

  if (v.verb === "go") {
    if (!rest.length) return { verb: "go", error: "missing" };
    if (rest.length === 1 && DIRECTIONS[rest[0]]) return { verb: "go", dir: DIRECTIONS[rest[0]] };
    const r = resolve(rest, nouns);
    return r.id ? { verb: "go", object: r.id } : { verb: "go", ...r };
  }

  const out = { verb: v.verb };
  const args = v.args || 0;
  if (args === 0) return out;
  if (!rest.length) return v.optional ? out : { ...out, error: "missing" };

  let objWords = rest;
  let tgtWords = null;
  if (args === 2) {
    const i = rest.findIndex((w, k) => k > 0 && (v.preps || []).includes(w));
    if (i > 0) { objWords = rest.slice(0, i); tgtWords = rest.slice(i + 1); }
  }
  const o = resolve(objWords, nouns);
  if (!o.id) return { ...out, ...o };
  out.object = o.id;
  if (args === 1) return out;
  if (!tgtWords || !tgtWords.length) return { ...out, error: "missing" };
  if (v.topic) { out.topic = tgtWords.join(" "); return out; }
  const t = resolve(tgtWords, nouns);
  if (!t.id) return { ...out, ...t };
  out.target = t.id;
  return out;
}
