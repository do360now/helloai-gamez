// Night Shift room pictures: one VGA-style draw list per room for render.js, built by small helpers so the
// art reads as code. world.json keeps the older 16-colour lists; the page draws these instead and falls back
// to those. Hotspots stay in world.json, and every picture is laid out around them.
//
// Pictures never depend on game state or seeded parameters, and never carry information the text does not
// give (agents.md): for example the workshop drawers have blank tape, because which drawer says BD is seeded.

// Starts a picture. `build` gets:
//   op(...)                 append one draw op
//   ramp(from, to, n=16)    define n colours from one hex to another; returns the first index
//   cycle(colours, ms)      define colours that rotate every ms; returns the first index
//   tone(hex)               define one colour that `light` leaves alone; returns its index
//   rnd(n)                  a seeded integer in 0..n-1, so a picture is the same on every load
function picture(seed, build) {
  var list = [], next = 16;
  function op() { list.push(Array.prototype.slice.call(arguments)); }
  function take(n) { var i = next; next += n; if (next > 256) throw new RangeError("picture uses more than 256 colours"); return i; }
  function ramp(from, to, n) { var i = take(n || 16); op("ramp", i, i + (n || 16) - 1, from, to); return i; }
  function cycle(colours, ms) {
    var i = take(colours.length);
    colours.forEach(function (c, k) { op("pal", i + k, c); });
    op("cycle", i, i + colours.length - 1, ms);
    return i;
  }
  function tone(hex) { var i = take(1); op("pal", i, hex); return i; }
  var s = seed | 0;
  function rnd(n) { // mulberry32: an LCG's low bits line scattered things up in columns
    s = (s + 0x6d2b79f5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  }
  build({ op: op, ramp: ramp, cycle: cycle, tone: tone, rnd: rnd });
  return list;
}

// The Starlight's carpet: dim confetti on a dark ground, smaller towards the back wall.
function confetti(p, y0, y1, ramps, count) {
  for (var k = 0; k < count; k++) {
    var y = y0 + 2 + p.rnd(y1 - y0 - 2), sc = 0.5 + (y - y0) / (y1 - y0), x = p.rnd(320), kind = p.rnd(4);
    var c = ramps[p.rnd(ramps.length)] + 2, s = Math.max(1, Math.round(2 * sc));
    if (kind === 0) { p.op("rect", x - s, y, s * 2 + 1, 1, c); p.op("rect", x, y - s, 1, s * 2 + 1, c); }
    else if (kind === 1) { p.op("line", x, y, x + s * 2, y - s, c); p.op("line", x + s * 2, y - s, x + s * 4, y, c); }
    else if (kind === 2) p.op("ellipse", x, y, s, Math.max(1, s - 1), c);
    else p.op("poly", c, [x, y - s - 1, x + s + 1, y + s, x - s - 1, y + s]);
  }
}

// Marquee bulbs every third pixel, each a step along a chase cycle of four.
function bulbs(p, x, y, w, chase) {
  for (var b = 0; b < w; b += 3) p.op("rect", x + b, y, 1, 1, chase + ((b / 3) % 4));
}

// Arcade carpet ramps shared by the floor and the prize counter.
function carpet(p) {
  return {
    ground: p.ramp("#040309", "#3e2e66"),
    dots: [p.ramp("#04222c", "#5ff0ff", 8), p.ramp("#2a0424", "#ff6ae0", 8), p.ramp("#2a2204", "#ffe878", 8)],
  };
}

var floor = picture(7, function (p) {
  var op = p.op;
  var WALL = p.ramp("#06041a", "#4a3f86"), C = carpet(p), CARP = C.ground, CONC = C.dots[0], CONM = C.dots[1], CONY = C.dots[2];
  var WOOD = p.ramp("#140904", "#9a6638"), MET = p.ramp("#08080e", "#c4c8d6"), RED = p.ramp("#1e0206", "#ff4a5e");
  var PUR = p.ramp("#10061e", "#b05cf0"), TEA = p.ramp("#021614", "#38dcca"), SKY = p.ramp("#010208", "#22305e");
  var YEL = p.ramp("#3a2600", "#ffd43c", 8), BLU = p.ramp("#041024", "#5aa0f0", 8), WARM = p.ramp("#1c0e04", "#ffcf8a", 8);
  // Cycling colours: drawing with one index of a range makes that pixel take each colour in turn.
  var PIECE = p.cycle(["#5ff0ff", "#020208", "#020208", "#020208"], 260);
  var PURS = p.cycle(["#2a0a5a", "#4a1a9a", "#7a2ad0", "#c04ae8", "#ff7af0", "#c04ae8", "#7a2ad0", "#4a1a9a"], 90);
  var TEAS = p.cycle(["#e8f0e8", "#e8f0e8", "#e8f0e8", "#e8f0e8", "#0a2a1a", "#0a2a1a", "#0a2a1a", "#0a2a1a"], 70);
  var BULB = p.cycle(["#fff4b0", "#6a4a18", "#6a4a18", "#6a4a18"], 160);
  var NEON = p.cycle(["#ff5ad0", "#ff5ad0", "#ff5ad0", "#ff5ad0", "#ff5ad0", "#5a1440", "#a02878", "#5a1440",
    "#ff5ad0", "#ff5ad0", "#ff5ad0", "#ff5ad0", "#ff5ad0", "#ff5ad0", "#ff5ad0", "#ff5ad0"], 110);
  var OPEN = p.cycle(["#ff3a2a", "#ff3a2a", "#ff3a2a", "#3a0808", "#ff3a2a", "#ff3a2a", "#ff3a2a", "#ff3a2a"], 230);
  var SPARK = p.cycle(["#ffffa0", "#ff9a2a", "#0c0816", "#0c0816", "#0c0816", "#0c0816", "#0c0816", "#0c0816", "#0c0816", "#0c0816", "#0c0816", "#0c0816"], 85);
  var x, k;

  // Back wall, wainscot and baseboard. Floor line at y=124.
  op("vgrad", 0, 0, 320, 96, WALL, WALL + 6);
  op("rect", 0, 0, 320, 6, WALL);
  op("vgrad", 0, 98, 320, 22, WALL + 2, WALL + 4);
  op("rect", 0, 96, 320, 2, WALL + 8);
  op("rect", 0, 120, 320, 4, WALL);
  for (x = 8; x < 320; x += 24) op("line", x, 99, x, 119, WALL + 1);

  // Front window behind Block Drop: night street, rain, a reversed OPEN sign.
  op("rect", 22, 46, 112, 60, MET + 3);
  op("vgrad", 24, 48, 108, 56, SKY, SKY + 9);
  [[24, 70, 14, 34], [40, 62, 20, 42], [62, 74, 16, 30], [80, 58, 22, 46], [104, 68, 28, 36]].forEach(function (b, n) {
    op("rect", b[0], b[1], b[2], b[3], SKY + 1);
    for (var wy = b[1] + 4; wy < 100; wy += 6) {
      for (var wx = b[0] + 2; wx < b[0] + b[2] - 2; wx += 5) if ((wx * 7 + wy * 3 + n) % 5 === 0) op("rect", wx, wy, 2, 2, WARM + 4 + ((wx + wy) % 3));
    }
  });
  op("ellipse", 120, 54, 3, 3, WARM + 7);
  op("rect", 30, 60, 1, 44, MET + 6); op("ellipse", 30, 59, 3, 1, WARM + 7); op("light", 30, 70, 12, 30, 3);
  for (k = 0; k < 26; k++) { var rx = 26 + ((k * 37) % 104), ry = 50 + ((k * 23) % 46); op("line", rx, ry, rx - 2, ry + 5, SKY + 8); }
  op("rect", 102, 74, 26, 11, 0); op("text", 104, 77, "OPEN", OPEN, 1, true); op("light", 115, 80, 16, 10, 3);
  op("line", 34, 50, 60, 100, SKY + 12); op("line", 108, 48, 130, 90, SKY + 11);
  op("rect", 22, 46, 112, 2, MET + 6); op("rect", 22, 104, 112, 2, MET + 2); op("rect", 77, 46, 2, 60, MET + 4);

  // West doorway into the staff hallway, under an EXIT sign.
  op("rect", 0, 40, 22, 84, WOOD + 3);
  op("vgrad", 0, 44, 18, 80, CARP + 1, CARP);
  op("rect", 1, 30, 19, 9, 2); op("text", 3, 32, "EXIT", 10); op("light", 10, 34, 14, 10, 3);
  op("rect", 18, 40, 2, 84, WOOD + 6);

  // East doorway to the prize counter, warm light spilling out.
  op("rect", 300, 38, 20, 86, WOOD + 4);
  op("vgrad", 303, 42, 17, 82, WARM + 5, WARM + 2);
  op("rect", 306, 70, 14, 2, WOOD + 7);
  [[307, 63, CONM + 6], [312, 64, CONC + 6], [316, 62, CONY + 6], [308, 78, PUR + 12], [314, 77, RED + 12]].forEach(function (d) { op("ellipse", d[0], d[1], 2, 3, d[2]); });
  op("rect", 286, 28, 32, 9, 0); op("text", 288, 30, "PRIZES", CONY + 7);
  op("light", 300, 64, 14, 40, 4);

  // Neon STARLIGHT over the right-hand cabinets.
  op("light", 252, 26, 66, 26, 6);
  op("poly", NEON, [204, 14, 206, 20, 212, 20, 207, 24, 209, 30, 204, 26, 199, 30, 201, 24, 196, 20, 202, 20]);
  op("text", 217, 17, "STARLIGHT", NEON, 2);

  // High score board on its brackets.
  op("line", 44, 0, 44, 26, MET + 5); op("line", 92, 0, 92, 26, MET + 5);
  op("rect", 34, 24, 68, 22, MET + 6); op("rect", 36, 26, 64, 18, 0);
  op("text", 40, 27, "HI-SCORES", CONC + 6);
  op("text", 40, 33, "ZZZ 999999", CONY + 7);
  op("text", 40, 39, "PRI 087150", CONY + 3);
  op("light", 68, 35, 40, 18, 2);

  // Office door, locked and dark.
  op("rect", 136, 56, 44, 70, WOOD + 2);
  op("rect", 138, 58, 40, 4, WOOD + 6);
  op("vgrad", 140, 62, 36, 64, WOOD + 7, WOOD + 4);
  op("rect", 144, 66, 28, 16, MET + 9); op("dither", 145, 67, 26, 14, MET + 9, MET + 11);
  op("text", 147, 72, "OFFICE", WOOD + 2);
  op("rect", 144, 86, 12, 34, WOOD + 5); op("rect", 160, 86, 12, 34, WOOD + 5);
  op("line", 144, 86, 155, 86, WOOD + 9); op("line", 160, 86, 171, 86, WOOD + 9);
  op("ellipse", 169, 99, 2, 2, YEL + 6); op("rect", 168, 98, 1, 1, 15);

  // The wall socket the power cord is still plugged into.
  op("rect", 104, 110, 6, 9, MET + 9); op("rect", 105, 113, 4, 4, 0); op("rect", 106, 112, 2, 6, MET + 3);

  // Carpet, darkest at the back.
  op("vgrad", 0, 124, 320, 76, CARP + 1, CARP + 7);
  confetti(p, 124, 200, C.dots, 170);
  op("shade", 0, 124, 320, 6, -2);

  // Shadows under the cabinets, then light pools from their screens.
  op("light", 68, 160, 36, 6, -6); op("light", 214, 160, 22, 5, -6); op("light", 252, 160, 22, 5, -6);
  op("light", 68, 172, 52, 22, 6); op("light", 213, 170, 34, 16, 5); op("light", 251, 170, 34, 16, 5);
  op("light", 310, 150, 30, 30, 4);

  // The square where a cabinet stood for years: cleaner and darker, with four dents from its feet.
  op("shade", 100, 150, 40, 32, -3);
  op("line", 100, 150, 139, 150, CARP + 6); op("line", 100, 181, 139, 181, CARP + 8);
  op("line", 100, 150, 100, 181, CARP + 7); op("line", 139, 150, 139, 181, CARP + 7);
  for (k = 0; k < 4; k++) op("rect", 103 + (k % 2) * 31, 153 + Math.floor(k / 2) * 24, 3, 2, CARP);

  // A cabinet facing the player; its side panel shows on the `side` it is turned towards.
  function cabinet(x, y, w, h, ramp, side) {
    var sw = 6, fx = side === "right" ? x : x + sw, sx = side === "right" ? x + w - sw : x, fw = w - sw;
    op("light", (fx + fw / 2) | 0, y + 30, fw, 34, 3); // glow on the wall behind
    op("vgrad", sx, y + 2, sw, h - 2, ramp + 3, ramp + 1);
    op("vgrad", fx, y, fw, h, ramp + 9, ramp + 4);
    op("line", fx, y, fx, y + h - 1, ramp + 12); op("line", fx + fw - 1, y, fx + fw - 1, y + h - 1, ramp + 2);
    return { x: fx, w: fw };
  }
  function coinDoor(x, y) {
    op("rect", x, y, 12, 16, MET + 3);
    op("rect", x + 2, y + 4, 2, 4, RED + 6); op("rect", x + 2, y + 5, 1, 2, 12);
    op("rect", x + 8, y + 4, 2, 4, RED + 6); op("rect", x + 8, y + 5, 1, 2, 12);
  }

  // Block Drop, with the high score board above it.
  var bd = cabinet(40, 50, 56, 110, RED, "right");
  op("rect", bd.x, 50, bd.w, 12, RED + 14); op("rect", bd.x + 2, 52, bd.w - 4, 8, 0);
  op("text", bd.x + 4, 54, "BLOCKDROP", CONY + 7); bulbs(p, bd.x + 1, 50, bd.w - 1, BULB); bulbs(p, bd.x + 1, 61, bd.w - 1, BULB);
  op("rect", 44, 63, 46, 42, MET + 1); op("rect", 47, 65, 40, 38, 0);
  op("rect", 54, 66, 26, 36, MET + 2); op("rect", 55, 66, 24, 35, 0);
  var cols = [[RED + 13, CONC + 7, CONY + 7, PUR + 13], [10, 9, 14, 12]];
  for (var cy = 0; cy < 3; cy++) for (var cx = 0; cx < 6; cx++) if ((cx + cy * 2) % 7 !== 3) op("rect", 55 + cx * 4, 89 + cy * 4, 3, 3, cols[cy % 2][(cx + cy) % 4]);
  [70, 74, 78, 82].forEach(function (py, n) { op("rect", 63, py, 3, 3, PIECE + n); op("rect", 67, py, 3, 3, PIECE + n); op("rect", 67, py - 4, 3, 3, PIECE + n); });
  op("light", 67, 84, 20, 20, 2);
  op("poly", MET + 7, [42, 106, bd.x + bd.w, 106, bd.x + bd.w, 116, 42, 118]);
  op("line", 42, 106, 89, 106, MET + 12);
  op("rect", 57, 107, 2, 7, MET + 13); op("ellipse", 58, 107, 2, 2, RED + 14);
  op("ellipse", 75, 111, 2, 1, 14); op("ellipse", 83, 111, 2, 1, 10);
  op("rect", 56, 124, 22, 22, MET + 3); op("rect", 57, 125, 20, 1, MET + 6);
  op("rect", 60, 128, 4, 5, RED + 6); op("rect", 61, 129, 1, 3, 12); op("rect", 70, 128, 4, 5, RED + 6); op("rect", 71, 129, 1, 3, 12);
  op("text", 59, 136, "25", MET + 9);
  op("rect", bd.x, 150, bd.w, 10, MET + 2);

  // Purple cabinet: a scrolling shooter.
  var pc = cabinet(196, 70, 34, 90, PUR, "left");
  op("rect", pc.x, 70, pc.w, 9, PUR + 14); op("rect", pc.x + 2, 72, pc.w - 4, 5, 0); op("text", pc.x + 3, 72, "ZAP", CONM + 7);
  bulbs(p, pc.x + 1, 70, pc.w - 1, BULB);
  op("rect", pc.x + 2, 80, pc.w - 4, 26, MET + 1);
  for (k = 0; k < 22; k++) op("rect", pc.x + 4, 82 + k, pc.w - 8, 1, PURS + ((k >> 1) % 8));
  op("poly", 15, [pc.x + 12, 101, pc.x + 15, 95, pc.x + 18, 101]);
  op("poly", MET + 7, [pc.x, 108, pc.x + pc.w, 108, pc.x + pc.w, 116, pc.x, 117]);
  op("rect", pc.x + 6, 109, 2, 5, MET + 13); op("ellipse", pc.x + 7, 109, 1, 1, CONM + 7); op("rect", pc.x + 18, 111, 3, 2, 12);
  coinDoor(pc.x + 8, 124);
  op("rect", pc.x, 152, pc.w, 8, MET + 2);

  // Teal cabinet: a night driving game.
  var tc = cabinet(234, 64, 34, 96, TEA, "left");
  op("rect", tc.x, 64, tc.w, 9, TEA + 14); op("rect", tc.x + 2, 66, tc.w - 4, 5, 0); op("text", tc.x + 2, 66, "RUSH", CONC + 7);
  bulbs(p, tc.x + 1, 64, tc.w - 1, BULB);
  op("rect", tc.x + 2, 74, tc.w - 4, 28, MET + 1);
  op("vgrad", tc.x + 4, 76, tc.w - 8, 8, SKY + 2, SKY + 8);
  op("poly", 2, [tc.x + 4, 84, tc.x + tc.w - 4, 84, tc.x + tc.w - 4, 100, tc.x + 4, 100]);
  op("poly", MET + 4, [tc.x + 13, 84, tc.x + 15, 84, tc.x + 24, 100, tc.x + 4, 100]);
  for (k = 84; k < 100; k++) { var hw = Math.round((k - 84) / 3); op("rect", tc.x + 14 - (hw >> 2), k, 1 + (hw >> 1), 1, TEAS + (k % 8)); }
  op("rect", tc.x + 10, 95, 6, 3, RED + 13);
  op("poly", MET + 7, [tc.x, 104, tc.x + tc.w, 104, tc.x + tc.w, 112, tc.x, 113]);
  op("ellipse", tc.x + 14, 107, 6, 2, MET + 2); op("ellipse", tc.x + 14, 107, 4, 1, MET + 9);
  coinDoor(tc.x + 8, 122);
  op("rect", tc.x, 152, tc.w, 8, MET + 2);

  // The power cord: plugged into the wall, split near the plug, trailing into the clean square to a bare end.
  var cord = [107, 119, 107, 134, 103, 150, 99, 160, 88, 166, 80, 170, 92, 174, 110, 171, 120, 166];
  for (k = 0; k + 3 < cord.length; k += 2) {
    op("line", cord[k], cord[k + 1] + 1, cord[k + 2], cord[k + 3] + 1, MET);
    op("line", cord[k], cord[k + 1], cord[k + 2], cord[k + 3], MET + 5);
  }
  op("rect", 106, 125, 3, 3, YEL + 7); op("rect", 107, 126, 1, 1, RED + 12);
  op("rect", 105, 124, 1, 1, SPARK); op("rect", 110, 127, 1, 1, SPARK); op("rect", 104, 127, 1, 1, SPARK + 1); op("rect", 109, 123, 1, 1, SPARK + 2);
  op("rect", 120, 165, 2, 1, YEL + 6); op("rect", 121, 167, 2, 1, YEL + 5);

  // Mop leaning by the prize-counter door, and the yellow bucket on wheels.
  op("light", 288, 168, 16, 4, -5);
  op("line", 280, 112, 294, 150, WOOD + 9); op("line", 281, 112, 295, 150, WOOD + 6);
  op("poly", MET + 10, [286, 146, 302, 146, 306, 157, 283, 157]);
  for (var m = 285; m < 305; m += 3) op("line", m, 148, m - 1 + (m % 2), 157, MET + 7);
  op("vgrad", 274, 154, 22, 16, YEL + 7, YEL + 2);
  op("ellipse", 285, 154, 11, 3, YEL + 7); op("ellipse", 285, 154, 9, 2, BLU + 3); op("line", 279, 154, 284, 153, BLU + 6);
  op("rect", 276, 167, 3, 3, MET); op("rect", 291, 167, 3, 3, MET);
  op("rect", 290, 148, 6, 6, MET + 9);
});

var counter = picture(11, function (p) {
  var op = p.op, k, x;
  var WALL = p.ramp("#03100f", "#2f7470"), C = carpet(p), CARP = C.ground;
  var MET = p.ramp("#08080e", "#c4c8d6"), WOOD = p.ramp("#140904", "#b07a48"), LOCK = p.ramp("#0e1218", "#a8b4c0");
  var RED = p.ramp("#1e0206", "#ff4a5e"), BLUE = p.ramp("#020a24", "#7ad0ff"), GOLD = p.ramp("#2a1a00", "#ffe070", 8);
  var BEAR = p.ramp("#1e0e04", "#d8a060", 8), PINK = p.ramp("#2a0618", "#ff8ad0", 8), PAPER = p.ramp("#4a4840", "#fffcf0", 8);
  var BULB = p.cycle(["#fff4b0", "#6a4a18", "#6a4a18", "#6a4a18"], 160);
  var SLUSH = p.cycle(["#0a3aa0", "#1650c8", "#2a6ae8", "#4a8aff", "#7ab0ff", "#4a8aff", "#2a6ae8", "#1650c8"], 120);
  var LCD = p.tone("#8aff6a");

  // Back wall under a fluorescent fixture.
  op("vgrad", 0, 0, 320, 112, WALL + 1, WALL + 6);
  op("rect", 0, 0, 320, 4, WALL);
  op("rect", 126, 4, 130, 4, MET + 12); op("rect", 128, 8, 126, 1, 15);
  op("light", 190, 10, 170, 110, 5);
  op("rect", 0, 108, 320, 4, WALL);

  // PRIZES sign with chase lights over the grille.
  op("rect", 140, 12, 100, 22, RED + 3); op("rect", 142, 14, 96, 18, 0);
  bulbs(p, 141, 12, 99, BULB); bulbs(p, 141, 33, 99, BULB);
  op("text", 167, 18, "PRIZES", GOLD + 7, 2); op("light", 190, 22, 60, 16, 2);

  // Behind the grille: shelves of prizes and the stockroom door.
  op("vgrad", 120, 40, 140, 54, WALL, WALL + 2);
  op("rect", 236, 44, 20, 50, WOOD + 2); op("rect", 238, 46, 16, 48, WOOD + 4); op("rect", 250, 68, 2, 3, GOLD + 6);
  op("rect", 122, 64, 112, 3, WOOD + 7); op("rect", 122, 90, 112, 3, WOOD + 7);
  function bear(x, y, ramp) {
    op("ellipse", x, y + 6, 5, 6, ramp + 4); op("ellipse", x, y - 2, 4, 4, ramp + 5);
    op("ellipse", x - 3, y - 6, 1, 1, ramp + 3); op("ellipse", x + 3, y - 6, 1, 1, ramp + 3);
    op("rect", x - 2, y - 3, 1, 1, 0); op("rect", x + 1, y - 3, 1, 1, 0); op("rect", x - 1, y - 1, 2, 1, ramp + 1);
    op("light", x - 2, y, 6, 8, 2);
  }
  bear(130, 52, BEAR); bear(144, 52, PINK); bear(218, 52, BEAR); bear(228, 52, PINK);
  // The radio-controlled car, top prize for three years, with its star tag.
  op("rect", 166, 54, 34, 10, RED + 4); op("rect", 168, 48, 22, 8, RED + 9); op("rect", 172, 50, 12, 4, BLUE + 6);
  op("ellipse", 172, 63, 4, 3, MET + 1); op("ellipse", 194, 63, 4, 3, MET + 1); op("ellipse", 172, 63, 1, 1, MET + 7); op("ellipse", 194, 63, 1, 1, MET + 7);
  op("poly", GOLD + 7, [204, 44, 206, 49, 211, 49, 207, 52, 209, 57, 204, 54, 199, 57, 201, 52, 197, 49, 202, 49]);
  // Sunglasses on a card, and more bears.
  for (k = 0; k < 4; k++) {
    x = 126 + k * 14;
    op("rect", x, 72, 12, 16, PAPER + 5);
    op("ellipse", x + 3, 80, 2, 2, 0); op("ellipse", x + 8, 80, 2, 2, 0); op("line", x + 5, 79, x + 6, 79, [PINK, GOLD, BLUE, RED][k] + 6);
  }
  bear(192, 80, PINK); bear(204, 80, BEAR); bear(216, 80, PINK); bear(228, 80, BEAR);
  // The grille itself, rolled down and padlocked at the bottom.
  op("rect", 116, 34, 148, 7, MET + 4); op("rect", 116, 34, 148, 1, MET + 9);
  for (x = 121; x < 260; x += 5) op("rect", x, 41, 1, 53, MET + 7);
  [52, 70, 88].forEach(function (y) { op("rect", 120, y, 140, 1, MET + 9); });
  op("rect", 118, 92, 144, 3, MET + 10);
  op("rect", 186, 94, 8, 7, GOLD + 5); op("rect", 187, 91, 6, 1, MET + 10); op("rect", 187, 91, 1, 4, MET + 10); op("rect", 192, 91, 1, 4, MET + 10);
  op("rect", 189, 96, 2, 2, GOLD);

  // Three staff lockers; the middle one has a Block Drop sticker, the last does not quite close.
  function locker(x) {
    op("rect", x, 40, 30, 90, LOCK + 2);
    op("vgrad", x + 1, 41, 28, 88, LOCK + 9, LOCK + 5);
    for (var v = 0; v < 4; v++) op("rect", x + 8, 46 + v * 3, 14, 1, LOCK + 2);
    for (v = 0; v < 3; v++) op("rect", x + 8, 116 + v * 3, 14, 1, LOCK + 3);
    op("rect", x + 22, 78, 3, 12, LOCK + 13); op("rect", x + 22, 89, 3, 1, LOCK + 2);
    op("rect", x + 10, 60, 10, 6, LOCK + 12); op("line", x + 1, 41, x + 1, 128, LOCK + 12);
  }
  locker(10); locker(44); locker(78);
  op("text", 13, 61, "1", LOCK + 2); op("text", 47, 61, "2", LOCK + 2); op("text", 81, 61, "3", LOCK + 2);
  [[50, 96, 14], [53, 96, 14], [53, 99, 14], [56, 96, 14]].forEach(function (s) { op("rect", s[0], s[1], 3, 3, s[2]); });
  op("rect", 49, 95, 11, 8, 13); op("rect", 50, 96, 9, 6, 1);
  [[51, 97], [54, 97], [57, 97], [54, 100]].forEach(function (s, n) { op("rect", s[0], s[1], 2, 2, [14, 11, 10, 12][n]); });
  op("poly", LOCK + 11, [104, 41, 110, 39, 110, 131, 104, 129]); op("rect", 103, 42, 1, 86, 0);

  // Carpet.
  op("vgrad", 0, 112, 320, 88, CARP + 2, CARP + 8);
  confetti(p, 112, 200, C.dots, 150);
  op("light", 190, 150, 140, 40, 3);
  op("light", 59, 134, 52, 6, -6); op("light", 287, 162, 22, 5, -6);

  // The counter: ledger open by the register.
  op("light", 188, 172, 90, 8, -7);
  op("vgrad", 110, 116, 156, 52, RED + 9, RED + 4);
  op("rect", 110, 116, 156, 2, GOLD + 6); op("rect", 110, 160, 156, 8, RED + 1);
  for (x = 128; x < 260; x += 34) op("poly", GOLD + 5, [x, 130, x + 3, 137, x + 10, 137, x + 4, 141, x + 6, 148, x, 144, x - 6, 148, x - 4, 141, x - 10, 137, x - 3, 137]);
  op("rect", 108, 106, 160, 10, WOOD + 10); op("rect", 108, 106, 160, 1, WOOD + 14); op("rect", 108, 115, 160, 1, WOOD + 4);
  op("poly", PAPER + 7, [140, 108, 155, 106, 155, 99, 141, 100]); op("poly", PAPER + 6, [155, 106, 170, 108, 169, 100, 155, 99]);
  for (k = 0; k < 3; k++) { op("line", 143, 102 + k * 2, 152, 101 + k * 2, PAPER + 1); op("line", 158, 101 + k * 2, 167, 102 + k * 2, PAPER + 1); }
  op("line", 160, 107, 168, 104, BLUE + 4);
  op("rect", 218, 98, 26, 9, MET + 6); op("rect", 222, 92, 16, 7, MET + 8); op("rect", 224, 93, 12, 4, 0); op("text", 225, 93, "0.00", LCD);
  for (k = 0; k < 5; k++) op("rect", 220 + k * 5, 100, 3, 2, MET + 12);
  op("rect", 216, 106, 30, 2, MET + 3);

  // Slush machine churning Blue Raspberry.
  op("light", 287, 100, 34, 40, 3);
  op("rect", 270, 70, 34, 5, MET + 12);
  op("rect", 272, 75, 30, 38, BLUE + 2);
  for (k = 0; k < 36; k++) op("line", 273, 76 + k, 300, 76 + k - 6, SLUSH + (k % 8));
  op("rect", 272, 75, 30, 4, BLUE + 1);
  op("rect", 274, 77, 2, 30, 15);
  op("vgrad", 270, 113, 34, 37, MET + 12, MET + 7);
  op("rect", 274, 117, 26, 9, BLUE + 4); op("text", 277, 119, "SLUSH", 15);
  op("rect", 285, 128, 4, 6, MET + 3); op("rect", 296, 129, 5, 5, PAPER + 7);
  op("rect", 276, 140, 22, 3, MET + 4);
  op("rect", 272, 150, 4, 10, MET + 3); op("rect", 298, 150, 4, 10, MET + 3);
});

var office = picture(13, function (p) {
  var op = p.op, k, x;
  var PANEL = p.ramp("#0c0804", "#8a6438"), FLOOR = p.ramp("#060403", "#6a4630"), DESK = p.ramp("#060a08", "#9ab4a2");
  var LAMP = p.ramp("#2a1a04", "#fff4c0", 8), SKIN = p.ramp("#2a1206", "#f0b08a", 8), HAIR = p.ramp("#24242a", "#ececf0", 8);
  var CARD = p.ramp("#1a0612", "#c05a8c", 8), SAFE = p.ramp("#030a06", "#5a8a6a", 8), PAPER = p.ramp("#3a3830", "#fffcf0", 8);
  var SEPIA = p.ramp("#24180c", "#e8d0a0", 8), GOLD = p.ramp("#2a1a00", "#ffe070", 8), STEEL = p.ramp("#08080c", "#b0b4c0", 8);
  var EDIT = p.cycle(["#ff3020", "#ff3020", "#ff3020", "#400806"], 260);
  var GREEN = p.tone("#40ff60");

  // Wood-panelled wall and a worn carpet; the room is dark except for the desk lamp.
  op("vgrad", 0, 0, 320, 112, PANEL + 1, PANEL + 3);
  for (x = 6; x < 320; x += 14) { op("line", x, 0, x, 111, PANEL); op("line", x + 1, 0, x + 1, 111, PANEL + 4); }
  op("rect", 0, 112, 320, 6, PANEL);
  op("vgrad", 0, 118, 320, 82, FLOOR + 1, FLOOR + 4);
  op("dither", 0, 118, 320, 82, FLOOR + 2, FLOOR + 3);
  op("shade", 0, 118, 320, 6, -1);

  // Wall clock: ten past two.
  op("ellipse", 127, 26, 8, 8, STEEL + 2); op("ellipse", 127, 26, 7, 7, PAPER + 6);
  op("line", 127, 26, 131, 22, 0); op("line", 127, 26, 130, 27, 0); op("rect", 127, 26, 1, 1, 4);

  // Opening day, 1979, in a light frame.
  op("rect", 30, 50, 26, 34, GOLD + 5); op("rect", 31, 51, 24, 32, GOLD + 2);
  op("vgrad", 33, 53, 20, 28, SEPIA + 4, SEPIA + 6);
  op("rect", 34, 58, 18, 14, SEPIA + 2); op("rect", 36, 59, 14, 3, SEPIA + 7); op("rect", 41, 64, 4, 8, SEPIA);
  op("rect", 37, 68, 3, 10, SEPIA + 1); op("ellipse", 38, 66, 1, 2, SEPIA + 6);
  op("rect", 46, 68, 3, 10, SEPIA + 1); op("ellipse", 47, 66, 1, 2, SEPIA + 6);
  op("line", 34, 72, 52, 72, 12);

  // Keyed switch panel, one switch per cabinet; Block Drop's is turned to EDIT.
  op("rect", 250, 40, 50, 60, STEEL + 2); op("vgrad", 252, 42, 46, 56, STEEL + 5, STEEL + 3);
  ["BD", "ZAP", "RSH", "PIN", "SKI", "KO"].forEach(function (name, n) {
    var cx = 259 + (n % 3) * 16, cy = 52 + Math.floor(n / 3) * 26;
    op("ellipse", cx, cy, 4, 4, STEEL + 7); op("ellipse", cx, cy, 3, 3, STEEL + 1);
    if (n === 0) op("line", cx - 2, cy + 2, cx + 2, cy - 2, GOLD + 6); else op("line", cx, cy - 2, cx, cy + 2, GOLD + 6);
    op("rect", cx + 4, cy - 6, 2, 2, n === 0 ? EDIT : GREEN);
    op("rect", cx - 6, cy + 7, 12, 7, PAPER + 6); op("text", cx - 6 + ((12 - name.length * 4 + 1) >> 1), cy + 8, name, 0);
  });

  // Marge behind the desk: grey hair, reading glasses, cardigan, pencil.
  op("poly", CARD + 3, [190, 78, 212, 78, 218, 110, 184, 110]);
  op("poly", PAPER + 6, [196, 78, 206, 78, 201, 88]);
  op("rect", 198, 72, 6, 7, SKIN + 3);
  op("ellipse", 201, 64, 7, 9, SKIN + 4);
  op("ellipse", 201, 56, 8, 4, HAIR + 4); op("rect", 193, 56, 2, 8, HAIR + 4); op("rect", 207, 56, 2, 8, HAIR + 3); op("ellipse", 201, 51, 3, 3, HAIR + 5);
  op("rect", 196, 64, 4, 3, HAIR); op("rect", 202, 64, 4, 3, HAIR); op("line", 200, 65, 201, 65, HAIR);
  op("rect", 197, 65, 2, 1, SKIN + 6); op("rect", 203, 65, 2, 1, SKIN + 6);
  op("rect", 199, 70, 4, 1, SKIN + 1);
  op("poly", CARD + 4, [186, 92, 192, 86, 200, 104, 192, 108]);
  op("poly", CARD + 4, [216, 92, 210, 86, 210, 106, 216, 106]);
  op("ellipse", 202, 106, 3, 2, SKIN + 4); op("line", 203, 100, 208, 108, GOLD + 7); op("rect", 203, 100, 1, 1, 0);

  // The desk lamp, then its light over wall, desk and Marge.
  op("rect", 98, 106, 12, 4, DESK + 4); op("line", 104, 106, 100, 94, DESK + 6); op("line", 100, 94, 106, 86, DESK + 6);
  op("poly", DESK + 5, [100, 84, 112, 82, 116, 94, 98, 96]);
  op("rect", 101, 95, 13, 1, LAMP + 7);
  op("light", 106, 104, 120, 60, 7);

  // Steel desk covered in invoices; the floor safe sits under it.
  op("rect", 90, 110, 140, 4, DESK + 9); op("rect", 90, 114, 140, 10, DESK + 5);
  op("rect", 92, 124, 36, 48, DESK + 4); op("rect", 222, 124, 6, 48, DESK + 3);
  for (k = 0; k < 3; k++) { op("rect", 95, 128 + k * 14, 30, 12, DESK + 5); op("rect", 106, 133 + k * 14, 8, 2, DESK + 9); }
  op("light", 165, 160, 60, 14, -6);
  [[118, 104, 22, 6], [142, 105, 18, 5], [164, 104, 16, 6], [150, 102, 14, 4]].forEach(function (s, n) {
    op("poly", PAPER + 5 + (n % 3), [s[0], s[1] + s[3], s[0] + s[2], s[1] + s[3] + 1, s[0] + s[2] + 1, s[1] + 1, s[0] + 1, s[1]]);
  });
  op("light", 106, 104, 70, 12, 4);
  op("rect", 145, 140, 40, 30, SAFE + 1); op("vgrad", 147, 142, 36, 26, SAFE + 5, SAFE + 2);
  op("ellipse", 162, 155, 7, 7, STEEL + 6); op("ellipse", 162, 155, 5, 5, STEEL + 2); op("line", 162, 148, 162, 150, GOLD + 7);
  op("rect", 174, 150, 3, 10, STEEL + 7); op("rect", 148, 144, 10, 3, GOLD + 4);
  op("rect", 145, 170, 40, 2, 0);

  // Guest chair by the door.
  op("rect", 56, 118, 30, 4, CARD + 1); op("rect", 56, 92, 4, 28, STEEL + 3); op("rect", 56, 92, 28, 10, CARD + 2);
  op("rect", 58, 122, 2, 44, STEEL + 4); op("rect", 82, 122, 2, 44, STEEL + 4);
  op("light", 70, 168, 20, 4, -4);
});

var hallway = picture(17, function (p) {
  var op = p.op, k, x, y;
  // One-point perspective: vanishing point (160, 76), far wall 110..210 x 40..112.
  var WALL = p.ramp("#050806", "#7a8a7c"), CEIL = p.ramp("#040504", "#4a544c", 8), LINO = p.ramp("#050505", "#8a8474");
  var MET = p.ramp("#08080e", "#c4c8d6"), DOOR = p.ramp("#06080c", "#7a8aa0"), POST = p.ramp("#101828", "#9ab0d0", 8);
  var FADE = p.ramp("#2a1410", "#e0a088", 8), PAPER = p.ramp("#3a3830", "#f4f0e0", 8), STAIR = p.ramp("#030303", "#5a5048", 8);
  var TUBE = p.cycle(["#f4fff8", "#f4fff8", "#f4fff8", "#f4fff8", "#f4fff8", "#26302a", "#f4fff8", "#26302a",
    "#f4fff8", "#f4fff8", "#f4fff8", "#f4fff8", "#f4fff8", "#f4fff8", "#f4fff8", "#f4fff8", "#f4fff8", "#f4fff8"], 70);
  var RED = p.tone("#ff4040"), GRN = p.tone("#40d060");

  op("poly", CEIL + 1, [0, 0, 320, 0, 210, 40, 110, 40]);
  op("poly", WALL + 4, [0, 0, 110, 40, 110, 112, 0, 191]);
  op("poly", WALL + 4, [320, 0, 210, 40, 210, 112, 320, 191]);
  op("rect", 110, 40, 100, 72, WALL + 3);
  op("poly", LINO + 5, [110, 112, 210, 112, 320, 191, 320, 200, 0, 200, 0, 191]);
  // Wainscot stripe and lino seams, all running to the vanishing point.
  op("poly", WALL + 2, [0, 120, 110, 92, 110, 112, 0, 191]); op("poly", WALL + 2, [320, 120, 210, 92, 210, 112, 320, 191]);
  op("rect", 110, 92, 100, 20, WALL + 2);
  op("line", 0, 120, 110, 92, WALL + 7); op("line", 320, 120, 210, 92, WALL + 7); op("line", 110, 92, 210, 92, WALL + 7);
  for (x = -200; x <= 520; x += 40) op("line", 160 + Math.round((x - 160) * 0.31), 112, x, 200, LINO + 3);
  [118, 126, 137, 152, 172].forEach(function (yy) { var t = (yy - 76) / 36; op("line", Math.round(160 - 50 * t), yy, Math.round(160 + 50 * t), yy, LINO + 3); });
  op("line", 110, 40, 110, 112, WALL + 1); op("line", 210, 40, 210, 112, WALL + 1);

  // The steel door to the loading dock at the far end.
  op("rect", 144, 56, 32, 56, DOOR + 2); op("vgrad", 146, 58, 28, 54, DOOR + 7, DOOR + 4);
  op("rect", 152, 62, 16, 12, 0); op("dither", 153, 63, 14, 10, POST + 1, MET + 5);
  op("rect", 148, 86, 24, 3, MET + 11); op("text", 152, 78, "DOCK", DOOR + 1);
  op("rect", 150, 30, 20, 7, 2); op("text", 152, 31, "EXIT", 10);

  // Fuse box hanging open on the left wall; one breaker taped over.
  op("poly", MET + 3, [20, 52, 66, 60, 66, 100, 20, 112]);
  op("poly", MET + 1, [24, 57, 62, 63, 62, 97, 24, 107]);
  for (k = 0; k < 5; k++) {
    var by = 62 + k * 8 + Math.round(k * 0.8);
    op("poly", MET + 8, [28, by, 40, by + 2, 40, by + 6, 28, by + 5]); op("rect", 31, by + 2, 4, 2, k === 2 ? 0 : MET + 12);
    op("poly", PAPER + 6, [44, by + 1, 58, by + 3, 58, by + 5, 44, by + 4]);
  }
  op("poly", PAPER + 7, [28, 79, 41, 81, 41, 85, 28, 84]); op("line", 29, 80, 40, 84, 4);
  op("poly", MET + 6, [8, 48, 20, 52, 20, 112, 8, 118]); op("rect", 10, 80, 2, 6, MET + 11);
  op("rect", 64, 70, 2, 2, RED); op("rect", 64, 76, 2, 2, GRN);

  // Galaxy Patrol poster, faded, with the clipping pinned to its corner.
  op("poly", PAPER + 3, [244, 57, 284, 48, 284, 104, 244, 95]);
  op("poly", POST + 2, [246, 59, 282, 51, 282, 101, 246, 93]);
  for (k = 0; k < 14; k++) op("rect", 248 + ((k * 13) % 32), 56 + ((k * 7) % 34), 1, 1, PAPER + 6);
  op("poly", FADE + 6, [263, 60, 270, 78, 256, 80]); op("rect", 260, 80, 2, 4, FADE + 4); op("rect", 266, 79, 2, 4, FADE + 4);
  op("poly", FADE + 3, [250, 86, 280, 81, 280, 87, 250, 92]); op("poly", PAPER + 5, [252, 92, 278, 88, 278, 90, 252, 94]);
  op("poly", PAPER + 7, [272, 50, 284, 48, 284, 62, 272, 64]); for (k = 0; k < 4; k++) op("line", 274, 54 + k * 2, 282, 53 + k * 2, PAPER + 1);
  op("rect", 273, 51, 1, 1, RED);

  // Stairwell down to the workshop, cut into the floor along the right wall, with its rail.
  op("poly", STAIR, [222, 116, 262, 116, 300, 162, 246, 162]);
  for (k = 0; k < 6; k++) { y = 120 + k * 7; var l = 225 + k * 4, r = 266 + k * 6; op("rect", l, y, r - l, 2, STAIR + 4 - Math.min(3, k >> 1)); }
  op("line", 222, 116, 246, 162, MET + 6); op("line", 262, 116, 300, 162, MET + 3);
  op("line", 224, 98, 250, 140, MET + 10); op("line", 224, 99, 250, 141, MET + 6);
  op("rect", 224, 98, 2, 18, MET + 8); op("rect", 249, 140, 2, 22, MET + 8);

  // The tube that cannot decide whether to stay on.
  op("poly", MET + 4, [118, 14, 202, 14, 198, 26, 122, 26]);
  op("rect", 124, 18, 72, 4, TUBE);
  op("light", 160, 40, 170, 110, 5);
  op("light", 160, 150, 130, 50, 3);
  op("shade", 0, 180, 320, 20, -1);
});

var dock = picture(19, function (p) {
  var op = p.op, k, x, y;
  var BRICK = p.ramp("#0c0504", "#8a4430"), CONC = p.ramp("#060606", "#8e8c86"), MET = p.ramp("#08080e", "#c4c8d6");
  var NIGHT = p.ramp("#010206", "#20283e", 8), SOD = p.ramp("#1e0e02", "#ffb860", 8), HAZ = p.ramp("#2a2000", "#ffd030", 8);
  var WOOD = p.ramp("#140904", "#a07040", 8), PAPER = p.ramp("#3a3830", "#fcf8ec", 8), RED = p.ramp("#200204", "#ff4a40", 8);
  var VAN = p.ramp("#101014", "#c8c8c4", 8), DUST = p.tone("#e8cc90");
  var RAIN = p.cycle(["#5a6a8a", "#1a2236", "#141a2a", "#101626"], 60);

  // Brick wall.
  op("vgrad", 0, 0, 320, 112, BRICK + 2, BRICK + 4);
  for (y = 0; y < 112; y += 6) {
    op("rect", 0, y, 320, 1, BRICK + 1);
    for (x = (y / 6) % 2 ? 0 : 7; x < 320; x += 14) op("rect", x, y, 1, 6, BRICK + 1);
  }

  // The roll-up door, all the way up: the alley outside, the van's back, the drizzle.
  op("vgrad", 80, 30, 160, 50, NIGHT, NIGHT + 3);
  op("rect", 80, 64, 160, 26, NIGHT + 2);
  for (x = 84; x < 236; x += 10) op("rect", x, 66, 1, 22, NIGHT + 1);
  op("vgrad", 80, 90, 160, 22, NIGHT + 1, NIGHT + 4);
  op("ellipse", 96, 48, 3, 2, SOD + 7); op("rect", 96, 50, 1, 40, NIGHT + 4); op("light", 96, 80, 40, 40, 4);
  op("rect", 168, 58, 54, 48, VAN + 3); op("rect", 170, 60, 24, 30, VAN + 5); op("rect", 196, 60, 24, 30, VAN + 5);
  op("rect", 194, 60, 2, 44, VAN + 1); op("rect", 172, 94, 4, 4, RED + 5); op("rect", 214, 94, 4, 4, RED + 5);
  op("rect", 172, 104, 12, 8, 0); op("rect", 206, 104, 12, 8, 0);
  op("light", 196, 100, 60, 14, -3);
  for (k = 0; k < 40; k++) { x = 82 + ((k * 41) % 156); y = 32 + ((k * 29) % 72); op("line", x, y, x - 1, y + 4, RAIN + (k % 4)); }
  op("rect", 76, 18, 168, 12, MET + 5);
  for (y = 19; y < 30; y += 3) op("rect", 76, y, 168, 1, MET + 2);
  op("rect", 76, 30, 4, 82, MET + 3); op("rect", 240, 30, 4, 82, MET + 3);

  // Caged bulb over the door to the hallway side.
  op("line", 40, 0, 40, 8, MET + 3); op("ellipse", 40, 13, 4, 5, SOD + 7);
  op("line", 36, 9, 36, 17, MET + 2); op("line", 40, 8, 40, 18, MET + 2); op("line", 44, 9, 44, 17, MET + 2); op("line", 36, 13, 44, 13, MET + 2);

  // Clipboard on its nail.
  op("rect", 33, 44, 2, 3, MET + 10);
  op("rect", 20, 48, 28, 40, WOOD + 4); op("rect", 23, 52, 22, 33, PAPER + 6);
  for (k = 0; k < 6; k++) op("rect", 25, 58 + k * 4, 14 + (k % 3) * 2, 1, PAPER + 1);
  op("rect", 28, 46, 12, 5, MET + 9);

  // Lift lever in its box, above the painted warning.
  op("rect", 48, 92, 16, 14, MET + 4); op("rect", 50, 94, 12, 10, MET + 1);
  op("rect", 55, 84, 2, 12, MET + 10); op("ellipse", 56, 84, 2, 2, RED + 6);
  for (x = 36; x < 82; x += 6) op("poly", HAZ + 6, [x, 114, x + 3, 114, x + 6, 108, x + 3, 108]);
  op("rect", 36, 106, 46, 2, 0); op("rect", 36, 114, 46, 1, 0);
  op("text", 37, 99, "STAND", HAZ + 7); op("text", 63, 99, "CLEAR", HAZ + 7);

  // The platform, which is the lift plate; hazard edge at the door.
  op("vgrad", 0, 112, 320, 88, CONC + 3, CONC + 7);
  for (k = 0; k < 90; k++) op("rect", p.rnd(320), 114 + p.rnd(86), 1 + p.rnd(2), 1, CONC + 2 + p.rnd(3));
  op("rect", 0, 140, 320, 1, CONC + 2); op("rect", 0, 141, 320, 1, CONC + 9);
  for (x = 80; x < 240; x += 8) op("poly", HAZ + 5, [x, 116, x + 4, 116, x + 8, 112, x + 4, 112]);
  op("rect", 80, 116, 160, 1, 0);

  // Tyre tracks curving off the platform towards the door, a dolly's narrow lines between them.
  function track(off, c, w) {
    var pts = [[0, 190], [30, 184], [60, 174], [88, 164], [112, 154], [128, 146], [146, 132], [158, 120]];
    for (var i = 0; i + 1 < pts.length; i++) for (var t = 0; t < w; t++) op("line", pts[i][0], pts[i][1] + off + t, pts[i + 1][0], pts[i + 1][1] + off + t, c);
  }
  track(-6, CONC + 1, 3); track(8, CONC + 1, 3); track(0, CONC + 2, 1); track(3, CONC + 2, 1);
  for (k = 0; k < 14; k++) { x = 6 + k * 8; y = 188 - Math.round(k * 2.5); op("rect", x, y - 6, 2, 1, CONC); op("rect", x + 2, y + 8, 2, 1, CONC); }

  // Hand dolly leaning on the wall; sawdust on one wheel.
  op("line", 260, 94, 268, 158, MET + 8); op("line", 261, 94, 269, 158, MET + 5);
  op("line", 278, 94, 284, 158, MET + 8); op("line", 279, 94, 285, 158, MET + 5);
  op("line", 260, 94, 279, 94, MET + 10); for (y = 110; y < 156; y += 14) op("line", 262, y, 281, y, MET + 6);
  op("rect", 262, 158, 28, 4, MET + 9);
  op("ellipse", 264, 160, 5, 6, 0); op("ellipse", 264, 160, 2, 2, MET + 6);
  op("ellipse", 286, 160, 5, 6, 0); op("ellipse", 286, 160, 2, 2, MET + 6);
  [[283, 156], [289, 158], [285, 164], [290, 162], [282, 162]].forEach(function (d) { op("rect", d[0], d[1], 1, 1, DUST); });

  op("light", 40, 40, 110, 130, 6);
  op("light", 160, 150, 170, 60, 2);
});

var alley = picture(23, function (p) {
  var op = p.op, k, x, y;
  var SKY = p.ramp("#030201", "#3a2410", 8), BRICK = p.ramp("#080404", "#a06040"), ASPH = p.ramp("#020202", "#8a6a48");
  var VAN = p.ramp("#0e0e10", "#f6f2e8"), MET = p.ramp("#08080a", "#c8c4bc"), DUMP = p.ramp("#020c06", "#4a9a6a");
  var DOOR = p.ramp("#020a04", "#3a8a4a", 8), WOOD = p.ramp("#140904", "#a07040", 8), SOD = p.ramp("#2a1400", "#ffd080", 8);
  var BAG = p.ramp("#040404", "#3a3a3a", 8), WARM = p.ramp("#1c0e04", "#ffcf8a", 8), LOGO = p.ramp("#2a0406", "#e83a40", 8);
  var NEON = p.cycle(["#ff4a3a", "#ff4a3a", "#ff4a3a", "#ff4a3a", "#ff4a3a", "#ff4a3a", "#401010", "#ff4a3a", "#401010", "#ff4a3a", "#ff4a3a", "#ff4a3a", "#ff4a3a", "#ff4a3a"], 80);
  var OIL = p.cycle(["#1a0a2a", "#0a1a2a", "#0a2a1a", "#2a2a0a", "#2a0a0a", "#1a0a2a", "#0a0a0a", "#0a0a0a"], 400);

  // Haze over the rooftops, then the arcade's back wall.
  op("vgrad", 0, 0, 320, 30, SKY, SKY + 4);
  op("rect", 0, 10, 60, 20, SKY); op("rect", 230, 6, 90, 24, SKY); op("rect", 252, 0, 8, 6, SKY); op("ellipse", 256, 2, 8, 3, SKY);
  op("vgrad", 0, 18, 320, 94, BRICK + 2, BRICK + 4);
  for (y = 18; y < 112; y += 6) {
    op("rect", 0, y, 320, 1, BRICK + 1);
    for (x = (y / 6) % 2 ? 0 : 7; x < 320; x += 14) op("rect", x, y, 1, 6, BRICK + 1);
  }
  op("rect", 0, 18, 320, 2, BRICK + 6);
  // Drainpipe.
  op("rect", 224, 18, 3, 94, MET + 3); op("rect", 224, 18, 1, 94, MET + 6);

  // The diner's back door under its buzzing sign.
  op("rect", 8, 22, 40, 12, 0); op("text", 10, 24, "DINER", NEON, 1);  op("rect", 6, 36, 42, 2, MET + 4);
  op("light", 28, 30, 40, 26, 4);
  op("rect", 8, 36, 38, 76, DOOR + 4); op("vgrad", 12, 40, 30, 72, WOOD + 4, WOOD + 2);
  op("rect", 16, 46, 22, 24, WOOD + 3); op("rect", 16, 76, 22, 30, WOOD + 3); op("rect", 36, 76, 3, 3, SOD + 6);

  // Dock door at the far right, lit from inside.
  op("rect", 276, 60, 44, 52, MET + 4); op("vgrad", 280, 66, 40, 46, WARM + 5, WARM + 2);
  op("rect", 276, 60, 44, 6, MET + 6);

  // Payphone on the wall.
  op("rect", 56, 60, 18, 40, MET + 5); op("rect", 58, 62, 14, 8, MET + 9); op("rect", 59, 63, 12, 6, 0); op("text", 60, 64, "25", SOD + 6);
  op("rect", 58, 74, 4, 20, 0); op("rect", 59, 76, 2, 16, MET + 2); op("line", 60, 94, 64, 102, 0);
  for (k = 0; k < 9; k++) op("rect", 64 + (k % 3) * 3, 74 + Math.floor(k / 3) * 4, 2, 2, MET + 11);
  op("rect", 70, 72, 1, 1, 15);

  // Wet asphalt.
  op("vgrad", 0, 112, 320, 88, ASPH + 1, ASPH + 3);
  for (k = 0; k < 120; k++) op("rect", p.rnd(320), 113 + p.rnd(87), 1 + p.rnd(3), 1, ASPH + p.rnd(3));
  op("rect", 0, 112, 320, 2, ASPH + 5);

  // The delivery van, parked nose-out, the distributor's logo on its side.
  op("light", 158, 138, 70, 8, -6);
  op("vgrad", 100, 64, 88, 62, VAN + 15, VAN + 9);
  op("poly", VAN + 13, [188, 76, 200, 76, 210, 98, 210, 126, 188, 126]);
  op("poly", SKY + 2, [190, 79, 199, 79, 206, 96, 190, 96]); op("line", 192, 80, 198, 94, SKY + 6);
  op("rect", 100, 64, 88, 2, VAN + 15); op("rect", 100, 118, 110, 8, VAN + 6); op("rect", 101, 66, 1, 52, VAN + 8);
  op("rect", 194, 100, 6, 1, VAN + 4); op("rect", 206, 108, 4, 4, SOD + 7);
  op("ellipse", 132, 88, 11, 11, LOGO + 6); op("ellipse", 132, 88, 8, 8, VAN + 15); op("poly", LOGO + 6, [126, 92, 132, 80, 138, 92]);
  op("rect", 148, 84, 32, 3, LOGO + 6); op("rect", 148, 90, 24, 2, VAN + 7);
  op("rect", 100, 104, 110, 2, LOGO + 6);
  op("ellipse", 122, 126, 10, 10, 0); op("ellipse", 122, 126, 5, 5, MET + 4); op("ellipse", 122, 126, 2, 2, MET + 8);
  op("ellipse", 192, 126, 10, 10, 0); op("ellipse", 192, 126, 5, 5, MET + 4); op("ellipse", 192, 126, 2, 2, MET + 8);

  // Dumpster with its lid up and the truck's sign.
  op("poly", DUMP + 3, [238, 86, 306, 86, 312, 62, 244, 62]);
  op("poly", BAG + 2, [244, 86, 256, 76, 270, 80, 286, 74, 300, 86]); op("ellipse", 262, 82, 8, 5, BAG + 4); op("ellipse", 288, 81, 9, 6, BAG + 3);
  op("vgrad", 236, 86, 72, 44, DUMP + 7, DUMP + 3);
  op("rect", 236, 86, 72, 3, DUMP + 9);
  for (x = 246; x < 300; x += 12) op("rect", x, 92, 2, 34, DUMP + 4);
  op("rect", 252, 100, 26, 11, 15); op("text", 254, 103, "4 AM", 0);
  op("rect", 240, 130, 6, 6, 0); op("rect", 298, 130, 6, 6, 0);

  // The sodium lamp: everything the colour of weak tea.
  op("rect", 86, 36, 2, 76, MET + 3);
  op("poly", MET + 5, [76, 30, 98, 30, 96, 36, 78, 36]); op("rect", 79, 36, 16, 2, SOD + 7);
  op("light", 88, 112, 150, 100, 8);
  op("light", 88, 40, 30, 20, 4);

  // Puddle, reflections and the oil stain where something heavy stood.
  op("ellipse", 155, 180, 36, 8, ASPH + 6); op("ellipse", 155, 180, 33, 6, ASPH + 3);
  op("rect", 86, 170, 2, 18, SOD + 5); op("rect", 87, 168, 1, 22, SOD + 3);
  for (k = 0; k < 6; k++) op("rect", 130 + k * 8, 176 + (k % 2) * 3, 5, 1, VAN + 10);
  op("ellipse", 222, 156, 22, 9, ASPH); op("ellipse", 222, 156, 17, 6, ASPH + 1);
  op("ellipse", 216, 155, 8, 3, OIL); op("ellipse", 230, 158, 6, 2, OIL + 2); op("ellipse", 222, 154, 3, 1, OIL + 4);
  op("rect", 12, 150, 20, 6, MET + 1); for (x = 14; x < 32; x += 3) op("rect", x, 151, 1, 4, 0);
  for (k = 0; k < 8; k++) op("rect", 230 + k * 9, 113, 1, 2 + (k % 3), ASPH + 7);
});

var van = picture(29, function (p) {
  var op = p.op, k, x, y;
  var PLY = p.ramp("#0c0804", "#a07e52"), RIB = p.ramp("#06060a", "#a8acb8", 8), FLOOR = p.ramp("#030303", "#4a4a48", 8);
  var BLANK = p.ramp("#04081a", "#5a76c8"), STRAP = p.ramp("#200a00", "#ff9a30", 8), PAPER = p.ramp("#3a3830", "#fcf8ec", 8);
  var SOD = p.ramp("#1a0e02", "#ffc070", 8), DOME = p.tone("#fff0c8"), MAR = p.tone("#ffd040"), MARR = p.tone("#ff4030");
  var CUP = p.ramp("#2a2a28", "#f0ece0", 8);

  // Cargo bay: plywood walls with E-track rails, ribbed floor, a dome light.
  op("fill", 0);
  op("vgrad", 10, 16, 300, 150, PLY + 4, PLY + 2);
  for (x = 30; x < 310; x += 36) op("line", x, 16, x, 165, PLY + 1);
  [64, 108].forEach(function (yy) { op("rect", 10, yy, 300, 4, RIB + 4); for (x = 14; x < 310; x += 6) op("rect", x, yy + 1, 3, 2, RIB); });
  op("vgrad", 10, 0, 300, 16, RIB + 1, RIB + 3);
  op("ellipse", 160, 8, 10, 3, DOME); op("light", 160, 30, 150, 100, 5);
  op("vgrad", 0, 165, 320, 35, FLOOR + 2, FLOOR + 4);
  for (y = 168; y < 200; y += 4) op("rect", 0, y, 320, 1, FLOOR + 1);

  // Side door with a window onto the sodium-lit alley.
  op("rect", 20, 40, 60, 142, RIB + 3); op("rect", 24, 44, 52, 134, RIB + 5);
  op("rect", 30, 50, 40, 36, 0); op("vgrad", 31, 51, 38, 34, SOD + 2, SOD + 4);
  for (y = 54; y < 84; y += 5) op("rect", 31, y, 38, 1, SOD + 1);
  op("rect", 64, 110, 8, 3, RIB + 7); op("rect", 50, 40, 1, 142, RIB + 2);
  op("light", 50, 70, 36, 30, 3);

  // The bundle: something tall and square under quilted moving blankets.
  op("light", 150, 186, 50, 6, -4);
  op("poly", BLANK + 6, [110, 50, 122, 34, 140, 40, 158, 30, 176, 38, 190, 46, 192, 184, 108, 184]);
  for (k = 0; k < 9; k++) { y = 44 + k * 16; op("line", 110, y, 190, y + 14, BLANK + 3); op("line", 110, y + 14, 190, y, BLANK + 3); }
  op("vgrad", 108, 120, 6, 64, BLANK + 4, BLANK + 1); op("vgrad", 186, 50, 6, 134, BLANK + 3, BLANK + 1);
  op("line", 130, 60, 128, 184, BLANK + 2); op("line", 168, 56, 170, 184, BLANK + 2);
  op("light", 150, 70, 60, 50, 3);
  op("rect", 180, 40, 8, 6, MAR); op("rect", 182, 42, 4, 2, MARR); op("rect", 180, 40, 8, 1, RIB + 2);
  // Ratchet straps, and the shipping label taped to the one that runs to the wall.
  [92, 148].forEach(function (yy) { op("rect", 106, yy, 88, 4, STRAP + 5); op("rect", 106, yy, 88, 1, STRAP + 7); op("rect", 140, yy - 2, 8, 8, RIB + 6); });
  op("poly", STRAP + 5, [192, 148, 296, 142, 296, 146, 192, 152]); op("ellipse", 298, 144, 3, 3, RIB + 6);
  op("poly", PAPER + 6, [228, 136, 270, 133, 271, 158, 229, 161]);
  op("rect", 232, 134, 6, 3, PAPER + 3); op("rect", 260, 132, 6, 3, PAPER + 3);
  op("text", 234, 140, "HOLD", 0);
  for (k = 0; k < 3; k++) op("line", 234, 148 + k * 4, 262 - k * 6, 147 + k * 4, 0);

  // Cold coffee on the wheel arch.
  op("vgrad", 240, 166, 70, 18, PLY + 5, PLY + 2); op("ellipse", 275, 166, 35, 4, PLY + 6);
  op("rect", 284, 154, 8, 10, CUP + 6); op("ellipse", 288, 154, 4, 1, CUP + 2); op("rect", 292, 157, 2, 4, CUP + 4);

  op("rect", 0, 0, 10, 200, 0); op("rect", 310, 0, 10, 200, 0);
});

var diner = picture(31, function (p) {
  var op = p.op, k, x, y;
  var TILE = p.ramp("#04100c", "#8ad8b8"), CHROME = p.ramp("#08080c", "#eef0f6"), RED = p.ramp("#1a0406", "#f0505a");
  var WHITE = p.ramp("#2a2a2c", "#fcfcf8", 8), SKINL = p.ramp("#1a0a04", "#b07848", 8), SKIND = p.ramp("#2a160a", "#f0b890", 8);
  var JACK = p.ramp("#04060e", "#4a5c9a", 8), COFFEE = p.ramp("#0a0402", "#7a4a2a", 8), GLASS = p.ramp("#0a1418", "#c8f0ff", 8);
  var PIE = p.ramp("#2a0606", "#ff6a5a", 8), CRUST = p.ramp("#2a1806", "#f0c080", 8), BLACK = p.ramp("#020202", "#3a3a3c", 8);
  var CREAM = p.ramp("#2a2a24", "#f4f0e0", 8), WARM = p.ramp("#2a1804", "#fff0c0", 8);
  var BURN = p.cycle(["#ff3010", "#e02808", "#ff3010", "#c02006", "#ff3010", "#ff4a1a"], 180);
  var STEAM = p.cycle(["#9a9a90", "#5a5a54", "#2a2a28", "#2a2a28"], 240);
  var ZZZ = p.cycle(["#f4f0e0", "#3a3a3c", "#3a3a3c", "#3a3a3c", "#3a3a3c", "#3a3a3c"], 420);

  // Tiled wall with a chrome rail, a menu board and two pendant lamps.
  op("vgrad", 0, 0, 320, 100, TILE + 3, TILE + 5);
  for (y = 6; y < 100; y += 8) op("rect", 0, y, 320, 1, TILE + 2);
  for (x = 0; x < 320; x += 8) op("rect", x, 0, 1, 100, TILE + 2);
  op("rect", 0, 64, 320, 3, CHROME + 9);
  op("rect", 232, 8, 72, 34, BLACK + 1); op("rect", 234, 10, 68, 30, BLACK);
  op("text", 237, 13, "PIE    1.50", CREAM + 7); op("text", 237, 21, "COFFEE  .75", CREAM + 7); op("text", 237, 29, "EGGS   2.25", CREAM + 7);
  [80, 210].forEach(function (lx) {
    op("line", lx, 0, lx, 8, BLACK + 3); op("poly", RED + 6, [lx - 6, 8, lx + 6, 8, lx + 9, 14, lx - 9, 14]); op("rect", lx - 6, 14, 12, 1, WARM + 7);
  });

  // Coffee station: four burners, two pots on them, one older than this shift.
  op("rect", 40, 50, 180, 4, CHROME + 8); op("rect", 40, 54, 180, 2, CHROME + 3);
  [54, 94, 174, 214].forEach(function (bx, n) {
    if (bx > 210) return;
    op("ellipse", bx, 49, 7, 1, n < 2 ? BURN : CHROME + 3);
  });
  function pot(x, dark) {
    op("poly", GLASS + 3, [x - 6, 34, x + 6, 34, x + 9, 46, x + 7, 48, x - 7, 48, x - 9, 46]);
    op("poly", dark ? COFFEE : COFFEE + 3, [x - 8, 40, x + 8, 40, x + 9, 46, x + 7, 48, x - 7, 48, x - 9, 46]);
    op("rect", x - 5, 30, 10, 4, BLACK + 3); op("rect", x + 8, 36, 3, 8, BLACK + 2); op("rect", x - 3, 35, 1, 10, GLASS + 7);
  }
  pot(54, false); pot(94, true);
  op("rect", 52, 24, 1, 1, STEAM); op("rect", 54, 20, 1, 1, STEAM + 1); op("rect", 53, 16, 1, 1, STEAM + 2); op("rect", 56, 26, 1, 1, STEAM + 3); op("rect", 55, 22, 1, 1, STEAM);

  // Lou, leaning on the counter with her crossword.
  op("poly", WHITE + 6, [124, 64, 152, 64, 160, 102, 116, 102]);
  op("poly", WHITE + 4, [128, 72, 148, 72, 150, 102, 126, 102]);
  op("rect", 135, 56, 6, 9, SKINL + 4);
  op("ellipse", 138, 48, 8, 9, SKINL + 5);
  op("rect", 129, 34, 18, 9, WHITE + 7); op("rect", 129, 41, 18, 2, WHITE + 4);
  op("ellipse", 138, 44, 8, 3, BLACK + 1); op("rect", 130, 44, 2, 6, BLACK + 1); op("rect", 144, 44, 2, 6, BLACK + 1);
  op("rect", 134, 48, 2, 1, BLACK); op("rect", 140, 48, 2, 1, BLACK); op("rect", 136, 53, 4, 1, SKINL + 2);
  op("poly", WHITE + 5, [124, 66, 116, 72, 92, 100, 100, 104, 122, 80]); op("ellipse", 92, 101, 4, 3, SKINL + 5);
  op("poly", WHITE + 5, [152, 66, 160, 74, 158, 104, 150, 104]); op("ellipse", 154, 104, 4, 2, SKINL + 5);

  // The counter.
  op("rect", 0, 100, 320, 4, CHROME + 12); op("rect", 0, 104, 320, 10, RED + 8); op("rect", 0, 113, 320, 1, CHROME + 6);
  op("vgrad", 0, 114, 320, 38, CHROME + 9, CHROME + 4);
  for (x = 4; x < 320; x += 10) op("rect", x, 116, 2, 34, CHROME + 11);
  op("rect", 0, 150, 320, 3, BLACK + 1);
  op("poly", CREAM + 7, [56, 106, 86, 104, 87, 110, 57, 112]);
  for (k = 0; k < 4; k++) for (var j = 0; j < 2; j++) op("rect", 60 + k * 4, 106 + j * 2, 3, 1, (k + j) % 2 ? 0 : CREAM + 3);
  op("line", 76, 107, 84, 107, CREAM + 2); op("line", 76, 109, 84, 108, CREAM + 2);

  // Pie case on the counter: two slices of cherry left.
  op("rect", 236, 70, 60, 34, CHROME + 7); op("rect", 238, 72, 56, 30, GLASS + 1);
  op("rect", 240, 86, 52, 2, CHROME + 10);
  op("poly", CRUST + 5, [244, 84, 262, 84, 252, 78]); op("poly", PIE + 4, [246, 83, 260, 83, 252, 79]);
  op("poly", CRUST + 5, [268, 84, 286, 84, 276, 78]); op("poly", PIE + 4, [270, 83, 284, 83, 276, 79]);
  op("rect", 248, 98, 36, 2, CHROME + 10);
  op("line", 240, 73, 250, 96, GLASS + 6); op("line", 241, 73, 251, 96, GLASS + 4);
  op("rect", 236, 104, 60, 2, CHROME + 5);

  // Checker floor.
  op("rect", 0, 153, 320, 47, BLACK);
  [[153, 8], [162, 10], [173, 13], [187, 13]].forEach(function (row, r) {
    var h = row[1], w = 16 + r * 4;
    for (x = -(r * 7); x < 320; x += w) if ((Math.floor(x / w) + r) % 2 === 0) op("rect", x, row[0], w, h, CREAM + 4);
  });

  // Chrome stools with red seats; Dale has one, asleep on his arms.
  function stool(x) {
    op("rect", x - 2, 152, 4, 36, CHROME + 8); op("rect", x - 1, 152, 1, 36, CHROME + 13);
    op("ellipse", x, 189, 9, 2, CHROME + 5);
    op("ellipse", x, 148, 9, 3, RED + 6); op("ellipse", x, 147, 8, 2, RED + 9);
  }
  stool(42); stool(152); stool(188); stool(262);
  op("poly", JACK + 4, [170, 116, 206, 112, 212, 150, 168, 150]);
  op("poly", JACK + 5, [168, 100, 210, 98, 212, 116, 168, 118]);
  op("poly", JACK + 3, [172, 96, 186, 92, 190, 102, 174, 104]);
  op("ellipse", 188, 98, 10, 7, BLACK + 2); op("ellipse", 186, 101, 6, 3, SKIND + 4);
  op("rect", 196, 96, 10, 6, JACK + 6); op("rect", 172, 148, 8, 6, JACK + 2); op("rect", 200, 148, 8, 6, JACK + 2);
  op("text", 204, 82, "Z", ZZZ); op("text", 210, 74, "Z", ZZZ + 1, 1); op("text", 216, 62, "Z", ZZZ + 2, 2);
  op("rect", 214, 94, 8, 7, CREAM + 6); op("ellipse", 218, 94, 4, 1, COFFEE + 2); op("rect", 222, 96, 2, 3, CREAM + 5);

  op("light", 80, 40, 90, 80, 4); op("light", 210, 40, 90, 80, 4);
  op("light", 80, 110, 80, 30, 3); op("light", 210, 110, 80, 30, 3);
  op("shade", 0, 186, 320, 14, -1);
});

var workshop = picture(37, function (p) {
  var op = p.op, k, x, y;
  var BLOCK = p.ramp("#040404", "#6a6862"), FLOOR = p.ramp("#030303", "#5a5852"), PIPE = p.ramp("#06060a", "#a8acb4", 8);
  var BENCH = p.ramp("#120802", "#b07a44"), CRT = p.ramp("#020604", "#4a6a58", 8), PCB = p.ramp("#021404", "#40b060", 8);
  var STICK = p.ramp("#2a2000", "#ffe030", 8), TOOL = p.ramp("#1a0204", "#ff4a40", 8), CAB = p.ramp("#06080c", "#8a98a8");
  var TAPE = p.ramp("#2a2010", "#f0e0b0", 8), STAIR = p.ramp("#0c0602", "#7a5030", 8), LAMP = p.tone("#fff6d0");
  var CUP = p.ramp("#2a2a28", "#f0ece0", 8);
  var TIP = p.cycle(["#ff6a20", "#ff8a30", "#ff6a20", "#e04a10", "#ff6a20", "#ffa040"], 200);
  var SMOKE = p.cycle(["#7a7a74", "#4a4a46", "#2a2a28", "#1a1a1a", "#1a1a1a"], 260);

  // Block walls, concrete floor, pipes along the ceiling.
  op("vgrad", 0, 0, 320, 160, BLOCK + 1, BLOCK + 4);
  for (y = 8; y < 160; y += 9) {
    op("rect", 0, y, 320, 1, BLOCK);
    for (x = (y / 9) % 2 ? 0 : 10; x < 320; x += 20) op("rect", x, y, 1, 9, BLOCK);
  }
  op("vgrad", 0, 160, 320, 40, FLOOR + 3, FLOOR + 6);
  op("rect", 0, 160, 320, 1, FLOOR + 1);
  op("ellipse", 120, 186, 6, 2, FLOOR + 1); for (x = 116; x < 125; x += 2) op("rect", x, 185, 1, 3, 0);
  op("rect", 0, 12, 320, 6, PIPE + 4); op("rect", 0, 13, 320, 1, PIPE + 6); op("rect", 0, 21, 320, 4, PIPE + 3);
  op("rect", 250, 18, 6, 58, PIPE + 4); op("rect", 251, 18, 1, 58, PIPE + 6);
  for (x = 40; x < 320; x += 70) op("rect", x, 11, 4, 8, PIPE + 2);

  // Stairs up to the hallway.
  op("poly", STAIR + 1, [0, 30, 20, 30, 64, 160, 0, 160]);
  for (k = 0; k < 9; k++) { y = 40 + k * 13; x = 4 + Math.round(k * 4.6); op("rect", 0, y, x + 12, 3, STAIR + 4); op("rect", 0, y + 3, x + 12, 1, STAIR); }
  op("line", 20, 30, 64, 160, STAIR + 5); op("line", 24, 20, 70, 150, PIPE + 5);

  // Parts cabinet: three drawers with blank masking tape.
  op("rect", 240, 76, 58, 86, CAB + 2); op("vgrad", 242, 78, 54, 82, CAB + 7, CAB + 4);
  [82, 108, 134].forEach(function (dy) {
    op("rect", 244, dy, 50, 22, CAB + 3); op("vgrad", 245, dy + 1, 48, 20, CAB + 9, CAB + 6);
    op("poly", TAPE + 6, [254, dy + 4, 276, dy + 3, 277, dy + 7, 254, dy + 8]);
    op("rect", 262, dy + 12, 14, 3, CAB + 12); op("rect", 262, dy + 15, 14, 1, CAB + 2);
  });
  op("rect", 240, 162, 58, 2, 0);

  // Workbench.
  op("light", 140, 166, 90, 6, -5);
  op("rect", 66, 116, 8, 48, BENCH + 4); op("rect", 206, 116, 8, 48, BENCH + 4);
  op("rect", 66, 142, 148, 4, BENCH + 3); for (k = 0; k < 6; k++) op("rect", 80 + k * 20, 136, 12, 6, [CAB + 6, TOOL + 3, STICK + 3][k % 3]);
  op("rect", 60, 106, 160, 4, BENCH + 12); op("rect", 60, 110, 160, 8, BENCH + 7); op("rect", 60, 117, 160, 1, BENCH + 2);
  for (k = 0; k < 7; k++) op("ellipse", 70 + p.rnd(140), 107 + p.rnd(2), 1 + p.rnd(2), 0, BENCH + 3);

  // The monitor: open, back off, yellow warning sticker on the frame.
  op("rect", 86, 66, 48, 40, PIPE + 2); op("rect", 88, 68, 44, 36, PIPE + 1);
  op("rect", 90, 70, 32, 26, CRT + 1); op("rect", 92, 72, 28, 22, CRT + 3); op("line", 94, 74, 104, 74, CRT + 7); op("line", 94, 75, 98, 75, CRT + 6);
  op("rect", 88, 98, 44, 8, PCB + 3);
  for (k = 0; k < 8; k++) op("rect", 90 + k * 5, 99 + (k % 2), 3, 2, [PCB + 7, STICK + 5, TOOL + 4, PIPE + 7][k % 4]);
  op("rect", 122, 72, 10, 12, STICK + 7); op("poly", 0, [128, 73, 124, 79, 127, 79, 125, 83, 130, 77, 127, 77]);
  op("line", 132, 80, 140, 100, 0); op("line", 132, 81, 141, 101, TOOL + 2);

  // Soldering iron in its stand, tip still hot.
  op("rect", 138, 104, 16, 2, PIPE + 3);
  for (k = 0; k < 4; k++) op("ellipse", 146, 99 + k * 2, 4, 1, PIPE + 6);
  op("line", 140, 104, 170, 98, PIPE + 2); op("line", 156, 101, 170, 98, 1); op("line", 156, 102, 170, 99, 9);
  op("line", 136, 105, 140, 104, TIP); op("rect", 135, 105, 1, 1, TIP + 2);
  op("rect", 134, 100, 1, 1, SMOKE); op("rect", 133, 96, 1, 1, SMOKE + 1); op("rect", 135, 92, 1, 1, SMOKE + 2); op("rect", 134, 88, 1, 1, SMOKE + 3);

  // Rudy's red toolbox, open: cutters, a jigsaw blade, a roll of labels.
  op("poly", TOOL + 5, [176, 80, 208, 80, 210, 92, 174, 92]);
  op("vgrad", 174, 92, 36, 14, TOOL + 7, TOOL + 3); op("rect", 174, 92, 36, 2, TOOL + 1);
  op("rect", 186, 88, 12, 2, PIPE + 6);
  op("line", 178, 94, 184, 90, PIPE + 7); op("line", 180, 94, 186, 90, PIPE + 7);
  for (k = 0; k < 8; k++) op("rect", 188 + k * 2, 90 + (k % 2), 1, 1, PIPE + 7);
  op("ellipse", 204, 92, 4, 3, CUP + 7); op("ellipse", 204, 92, 1, 1, CUP + 2);

  // Coffee cup with a ring, screwdrivers.
  op("rect", 68, 98, 8, 8, CUP + 6); op("ellipse", 72, 98, 4, 1, CUP + 2); op("rect", 76, 100, 2, 4, CUP + 5);
  op("line", 214, 104, 218, 96, TOOL + 5); op("line", 216, 104, 219, 98, STICK + 5);

  // The hanging lamp over the bench.
  op("line", 160, 25, 160, 34, PIPE + 2);
  op("poly", PIPE + 5, [152, 34, 168, 34, 176, 44, 144, 44]); op("ellipse", 160, 44, 8, 2, LAMP);
  op("light", 160, 100, 120, 70, 7);
  op("light", 160, 44, 40, 14, 3);
});

var stockroom = picture(41, function (p) {
  var op = p.op, k, x, y;
  var WALL = p.ramp("#03040a", "#46567a"), FLOOR = p.ramp("#030303", "#5a5650"), SHELF = p.ramp("#06060a", "#b0b4c0", 8);
  var BEAR = p.ramp("#1e0e04", "#d8a060", 8), PINK = p.ramp("#2a0618", "#ff8ad0", 8), CYAN = p.ramp("#04202a", "#6af0ff", 8);
  var YEL = p.ramp("#2a2004", "#ffe070", 8), BOX = p.ramp("#140c04", "#c89a60"), PLY = p.ramp("#120a04", "#c09a64", 8);
  var PAINT = p.ramp("#04060c", "#3a4462", 8), DUST = p.ramp("#2a2010", "#f4dca4", 8), WARM = p.ramp("#1c0e04", "#ffcf8a", 8);
  var BAGLIGHT = p.tone("#e8f0ff"), BULB = p.tone("#fff6d0");

  op("vgrad", 0, 0, 320, 118, WALL + 1, WALL + 4);
  for (y = 10; y < 118; y += 10) { op("rect", 0, y, 320, 1, WALL); for (x = (y / 10) % 2 ? 0 : 12; x < 320; x += 24) op("rect", x, y, 1, 10, WALL); }
  op("vgrad", 0, 118, 320, 82, FLOOR + 2, FLOOR + 5);
  op("rect", 0, 118, 320, 1, FLOOR + 1);

  // The grille, seen from behind, with the prize counter's light through it.
  op("vgrad", 0, 0, 10, 118, WARM + 4, WARM + 2);
  for (y = 0; y < 118; y += 4) op("rect", 0, y, 10, 1, SHELF + 3);
  op("rect", 9, 0, 2, 118, SHELF + 5);
  op("light", 6, 70, 40, 80, 4);

  // Steel shelves of plush in plastic bags.
  [12, 155].forEach(function (ux) { op("rect", ux, 22, 3, 104, SHELF + 5); for (y = 26; y < 124; y += 6) op("rect", ux + 1, y, 1, 2, SHELF + 1); });
  [40, 82, 122].forEach(function (sy) { op("rect", 10, sy, 150, 4, SHELF + 6); op("rect", 10, sy, 150, 1, SHELF + 7); op("rect", 10, sy + 4, 150, 1, SHELF + 1); });
  op("rect", 10, 22, 150, 2, SHELF + 6);
  var plush = [BEAR, PINK, CYAN, YEL, PINK, BEAR, CYAN];
  [[40, 26], [82, 52], [122, 92]].forEach(function (row, r) {
    var top = row[1], base = row[0];
    for (var i = 0; i < 7; i++) {
      var px = 22 + i * 19 + ((r * 5) % 7), ramp = plush[(i + r * 2) % plush.length], h = base - top - 2;
      op("ellipse", px, base - Math.min(10, h >> 1), 8, Math.min(10, h >> 1), ramp + 4);
      op("ellipse", px, base - Math.min(10, h >> 1) - 9, 5, 5, ramp + 5);
      op("ellipse", px - 4, base - Math.min(10, h >> 1) - 13, 1, 1, ramp + 3); op("ellipse", px + 4, base - Math.min(10, h >> 1) - 13, 1, 1, ramp + 3);
      op("rect", px - 2, base - Math.min(10, h >> 1) - 10, 1, 1, 0); op("rect", px + 1, base - Math.min(10, h >> 1) - 10, 1, 1, 0);
      op("line", px - 6, base - 18, px - 4, base - 4, BAGLIGHT); op("rect", px - 1, base - Math.min(10, h >> 1) - 15, 3, 1, BAGLIGHT);
    }
  });
  for (k = 0; k < 30; k++) { var sy2 = [40, 82, 122][k % 3] - 1; op("rect", 12 + p.rnd(146), sy2, 1, 1, DUST + 5 + p.rnd(3)); }

  // Flattened cartons, and a box of brass tokens in front.
  op("poly", BOX + 5, [184, 152, 192, 94, 214, 94, 206, 152]);
  op("poly", BOX + 7, [198, 152, 208, 98, 232, 98, 222, 152]);
  op("poly", BOX + 6, [214, 152, 226, 104, 250, 104, 238, 152]);
  op("line", 196, 110, 204, 112, BOX + 2); op("line", 214, 116, 222, 118, BOX + 3);
  op("rect", 176, 132, 34, 20, BOX + 9); op("rect", 176, 132, 34, 2, BOX + 12); op("rect", 178, 128, 30, 4, BOX + 4);
  for (k = 0; k < 9; k++) op("ellipse", 181 + (k % 5) * 6, 129 + Math.floor(k / 5) * 2, 2, 1, YEL + 6);
  op("text", 182, 140, "TOKENS", BOX + 2);

  // The sawn-off back panel of a cabinet, leaning on the wall: painted plywood, jigsaw-ragged edge.
  op("light", 280, 152, 30, 6, -5);
  op("poly", PAINT + 3, [262, 46, 266, 44, 271, 47, 276, 44, 282, 46, 287, 43, 292, 46, 296, 45, 300, 150, 256, 150]);
  op("poly", PLY + 5, [296, 45, 298, 46, 302, 150, 300, 150]);
  op("poly", PLY + 6, [262, 46, 266, 44, 271, 47, 276, 44, 282, 46, 287, 43, 292, 46, 296, 45, 296, 47, 292, 48, 287, 45, 282, 48, 276, 46, 271, 49, 266, 46, 262, 48]);
  [70, 90, 110].forEach(function (vy) { op("rect", 270, vy, 18, 3, 0); });
  for (k = 0; k < 10; k++) op("rect", 260 + p.rnd(36), 52 + p.rnd(90), 1 + p.rnd(2), 1, PAINT + 6);

  // Sawdust: a pile at its foot and everywhere else.
  op("ellipse", 280, 158, 26, 6, DUST + 3); op("ellipse", 278, 156, 18, 4, DUST + 5); op("ellipse", 276, 155, 8, 2, DUST + 7);
  for (k = 0; k < 120; k++) op("rect", p.rnd(320), 120 + p.rnd(80), 1, 1, DUST + 2 + p.rnd(5));

  // One bare bulb.
  op("line", 210, 0, 210, 10, SHELF + 2); op("ellipse", 210, 13, 3, 4, BULB);
  op("light", 210, 60, 160, 120, 6);
  op("light", 160, 150, 160, 50, 2);
});

export const PICTURES = {
  floor: floor, counter: counter, office: office, hallway: hallway, dock: dock, alley: alley, van: van,
  diner: diner, workshop: workshop, stockroom: stockroom,
};
