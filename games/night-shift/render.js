// Night Shift room renderer: an AGI-style draw list on a 320x200 canvas in the 16 EGA colours.
// Reads a room's `draw` list from the world data; never touches game state. No DOM beyond the
// canvas context passed in, so a test can hand it a recording stub.
//
// Draw list ops (colours are 0..15, coordinates are integer pixels, x 0..319, y 0..199):
//   ["fill", c]                       whole picture
//   ["rect", x, y, w, h, c]           filled rectangle
//   ["line", x1, y1, x2, y2, c]       one pixel wide
//   ["poly", c, [x1, y1, x2, y2, ...]]  filled polygon (even-odd), crisp edges
//   ["dither", x, y, w, h, c1, c2]    checkerboard of two colours
var NightShiftRender = (function () {
  "use strict";

  var WIDTH = 320, HEIGHT = 200;

  // The standard EGA palette.
  var PALETTE = [
    "#000000", "#0000aa", "#00aa00", "#00aaaa", "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa",
    "#555555", "#5555ff", "#55ff55", "#55ffff", "#ff5555", "#ff55ff", "#ffff55", "#ffffff",
  ];

  function colour(c) {
    if (!Number.isInteger(c) || c < 0 || c > 15) throw new RangeError("colour must be 0..15, got " + c);
    return PALETTE[c];
  }

  function px(ctx, x, y, w, h) {
    // Clip to the picture so a sloppy list cannot draw outside the 320x200 area.
    var x0 = Math.max(0, x), y0 = Math.max(0, y);
    var x1 = Math.min(WIDTH, x + w), y1 = Math.min(HEIGHT, y + h);
    if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  function line(ctx, x1, y1, x2, y2) {
    // Bresenham, so lines stay one hard pixel wide.
    var dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1);
    var sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    var err = dx + dy;
    for (;;) {
      px(ctx, x1, y1, 1, 1);
      if (x1 === x2 && y1 === y2) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x1 += sx; }
      if (e2 <= dx) { err += dx; y1 += sy; }
    }
  }

  function poly(ctx, pts) {
    var n = pts.length / 2;
    if (n < 3 || pts.length % 2) throw new RangeError("poly needs at least 3 x,y pairs");
    var minY = Infinity, maxY = -Infinity;
    for (var i = 1; i < pts.length; i += 2) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); }
    minY = Math.max(0, minY); maxY = Math.min(HEIGHT - 1, maxY);
    for (var y = minY; y <= maxY; y++) {
      var xs = [], cy = y + 0.5;
      for (var a = 0; a < n; a++) {
        var x1 = pts[a * 2], y1 = pts[a * 2 + 1];
        var x2 = pts[((a + 1) % n) * 2], y2 = pts[((a + 1) % n) * 2 + 1];
        if ((y1 <= cy && y2 > cy) || (y2 <= cy && y1 > cy)) xs.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var from = Math.round(xs[k]), to = Math.round(xs[k + 1]);
        if (to > from) px(ctx, from, y, to - from, 1);
      }
    }
  }

  function dither(ctx, x, y, w, h, c1, c2) {
    ctx.fillStyle = colour(c1);
    px(ctx, x, y, w, h);
    ctx.fillStyle = colour(c2);
    for (var j = 0; j < h; j++) {
      for (var i = (j + x + y) & 1; i < w; i += 2) px(ctx, x + i, y + j, 1, 1);
    }
  }

  // Draws one picture. `list` is the room's draw array.
  function drawPicture(ctx, list) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = colour(0);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (var i = 0; i < list.length; i++) {
      var op = list[i], name = op[0];
      if (name === "fill") { ctx.fillStyle = colour(op[1]); ctx.fillRect(0, 0, WIDTH, HEIGHT); }
      else if (name === "rect") { ctx.fillStyle = colour(op[5]); px(ctx, op[1], op[2], op[3], op[4]); }
      else if (name === "line") { ctx.fillStyle = colour(op[5]); line(ctx, op[1], op[2], op[3], op[4]); }
      else if (name === "poly") { ctx.fillStyle = colour(op[1]); poly(ctx, op[2]); }
      else if (name === "dither") dither(ctx, op[1], op[2], op[3], op[4], op[5], op[6]);
      else throw new RangeError("unknown draw op: " + name);
    }
  }

  // Checks a list without drawing; returns an array of problems (empty when fine). The solver or CI can use it.
  function validate(list) {
    var arity = { fill: 2, rect: 6, line: 6, poly: 3, dither: 7 }, problems = [];
    if (!Array.isArray(list)) return ["draw must be an array"];
    list.forEach(function (op, i) {
      if (!Array.isArray(op) || !(op[0] in arity)) return problems.push("op " + i + ": unknown op");
      if (op.length !== arity[op[0]]) return problems.push("op " + i + ": " + op[0] + " takes " + (arity[op[0]] - 1) + " arguments");
      var cols = op[0] === "fill" ? [op[1]] : op[0] === "poly" ? [op[1]] : op[0] === "dither" ? [op[5], op[6]] : [op[5]];
      cols.forEach(function (c) { if (!Number.isInteger(c) || c < 0 || c > 15) problems.push("op " + i + ": bad colour " + c); });
    });
    return problems;
  }

  // Maps a pointer position on the displayed canvas to picture pixels, whatever the CSS size.
  function toPicture(canvas, clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return {
      x: Math.floor(((clientX - r.left) / r.width) * WIDTH),
      y: Math.floor(((clientY - r.top) / r.height) * HEIGHT),
    };
  }

  // First hotspot containing the point wins. hotspots: [{rect:[x,y,w,h], cmd:"look at counter"}].
  function hotspotAt(hotspots, x, y) {
    for (var i = 0; i < (hotspots || []).length; i++) {
      var h = hotspots[i], r = h.rect;
      if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return h;
    }
    return null;
  }

  return { WIDTH: WIDTH, HEIGHT: HEIGHT, PALETTE: PALETTE, drawPicture: drawPicture, validate: validate, toPicture: toPicture, hotspotAt: hotspotAt };
})();

export const WIDTH = NightShiftRender.WIDTH, HEIGHT = NightShiftRender.HEIGHT, PALETTE = NightShiftRender.PALETTE;
export const drawPicture = NightShiftRender.drawPicture, validate = NightShiftRender.validate;
export const toPicture = NightShiftRender.toPicture, hotspotAt = NightShiftRender.hotspotAt;
