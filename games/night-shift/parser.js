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

const phraseCache = new WeakMap();
function verbPhrases(verbs) {
  let out = phraseCache.get(verbs);
  if (out) return out;
  out = [];
  for (const v of verbs) {
    out.push({ v, words: v.verb.split(" ") });
    for (const s of v.synonyms || []) out.push({ v, words: s.split(" ") });
  }
  out.sort((a, b) => b.words.length - a.words.length);
  phraseCache.set(verbs, out);
  return out;
}

function startsWith(words, phrase) {
  if (phrase.length > words.length) return false;
  for (let i = 0; i < phrase.length; i++) if (words[i] !== phrase[i]) return false;
  return true;
}

const CODE_PREPS = new Set(["with", "to", "at", "using"]);
const isCode = (w) => /^\d+$/.test(w);

// Resolves a noun phrase to an id. Tries the whole phrase, then shorter windows: leading words the
// world does not know ("red mop") and trailing particles ("photo over") are dropped. Longest window
// wins. Returns {id, rest} | {error, word, ids}, where rest is the trailing words not used.
function resolve(words, nouns) {
  for (let len = words.length; len >= 1; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      const sub = words.slice(start, start + len).join(" ");
      const ids = [];
      for (const n of nouns) if ((n.nouns || []).includes(sub) && !ids.includes(n.id)) ids.push(n.id);
      if (ids.length === 1) return { id: ids[0], rest: words.slice(start + len) };
      if (ids.length > 1) return { error: "ambiguous", word: sub, ids };
    }
  }
  // Name the first word the world does not know, not the whole phrase.
  const known = new Set(nouns.flatMap((n) => (n.nouns || []).flatMap((x) => x.split(" "))));
  const word = words.find((w) => !known.has(w) && !CODE_PREPS.has(w)) || words[words.length - 1];
  return { error: "noun", word };
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
    return r.id ? { verb: "go", object: r.id } : { verb: "go", error: r.error, word: r.word, ...(r.ids ? { ids: r.ids } : {}) };
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
  // A lone direction after a one-argument verb: "look north".
  const dirWords = objWords.filter((w) => !CODE_PREPS.has(w));
  if (args === 1 && dirWords.length === 1 && DIRECTIONS[dirWords[0]]) return { ...out, dir: DIRECTIONS[dirWords[0]] };
  // A one-argument verb may carry "<prep> <code or thing>" after its object: "open safe with 0451",
  // "turn dial to 0451", "open door with key". Split there before resolving.
  let after = [];
  if (args === 1) {
    const pi = objWords.findIndex((w, k) => k > 0 && CODE_PREPS.has(w));
    if (pi > 0) { after = objWords.slice(pi + 1); objWords = objWords.slice(0, pi); }
  }
  const o = resolve(objWords, nouns);
  if (!o.id) return { ...out, ...o };
  out.object = o.id;
  if (args === 1) {
    if (!after.length) return out;
    if (after.length === 1 && isCode(after[0])) { out.code = after[0]; return out; }
    const t = resolve(after, nouns);
    if (!t.id) return { ...out, error: t.error, word: t.word, ...(t.ids ? { ids: t.ids } : {}) };
    out.target = t.id;
    return out;
  }
  if (!tgtWords || !tgtWords.length) return { ...out, error: "missing" };
  if (v.topic) { out.topic = tgtWords.join(" "); return out; }
  if (tgtWords.length === 1 && isCode(tgtWords[0])) { out.code = tgtWords[0]; return out; }
  const t = resolve(tgtWords, nouns);
  if (!t.id) return { ...out, ...t };
  out.target = t.id;
  return out;
}
