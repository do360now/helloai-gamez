// Night Shift room renderer: a Sierra SCI-style draw list on a 320x200 picture in 256 indexed colours.
// Reads a draw list (pictures.js, or a room's `draw` in the world data); never touches game state. No DOM
// beyond the canvas context passed in.
//
// The picture is drawn once into colour indices. Colours 0..15 are always the EGA palette; a list can define
// 16..255 with `pal` and `ramp`. Animation is palette cycling: `cycle` rotates a range of colours on a clock,
// so the picture is never redrawn, only re-coloured.
//
// Draw list ops (colours are 0..255, coordinates are integer pixels, x 0..319, y 0..199):
//   ["fill", c]                         whole picture
//   ["rect", x, y, w, h, c]             filled rectangle
//   ["line", x1, y1, x2, y2, c]         one pixel wide
//   ["poly", c, [x1, y1, x2, y2, ...]]  filled polygon (even-odd), crisp edges
//   ["dither", x, y, w, h, c1, c2]      checkerboard of two colours
//   ["ellipse", cx, cy, rx, ry, c]      filled ellipse
//   ["pal", i, "#rrggbb"]               define colour i (16..255)
//   ["ramp", i, j, "#from", "#to"]      define colours i..j as an even ramp; `light` and `shade` move along it
//   ["vgrad", x, y, w, h, c0, c1]       ordered-dither gradient from colour c0 to c1, top to bottom
//   ["hgrad", x, y, w, h, c0, c1]       the same, left to right
//   ["light", cx, cy, rx, ry, n]        move pixels up to n steps along their own ramp, fading to the ellipse edge
//                                       (n < 0 darkens); pixels outside any ramp are left alone
//   ["shade", x, y, w, h, n]            move every pixel in the rectangle n steps along its ramp
//   ["text", x, y, "TEXT", c, scale?, mirror?]  3x5 capitals, digits and - . : ' ! /
//   ["cycle", i, j, ms]                 rotate colours i..j by one place every ms milliseconds
var NightShiftRender = (function () {
  "use strict";

  var WIDTH = 320, HEIGHT = 200;

  // The standard EGA palette.
  var PALETTE = [
    "#000000", "#0000aa", "#00aa00", "#00aaaa", "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa",
    "#555555", "#5555ff", "#55ff55", "#55ffff", "#ff5555", "#ff55ff", "#ffff55", "#ffffff",
  ];

  // 4x4 Bayer thresholds, so gradients and fractional light dither the way VGA art did.
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function threshold(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }

  var FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
    F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
    K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
    Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "110001010001110",
    4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111",
    9: "111101111001110", "-": "000000111000000", ".": "000000000000010", ":": "000010000010000",
    "'": "010010000000000", "!": "010010010000010", "/": "001001010100100", " ": "000000000000000",
  };

  function hex(s) { return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; }

  // Draws a list into indices. Returns { buf, palette, cycles } for present(); throws on a bad list.
  function compile(list) {
    var problems = validate(list);
    if (problems.length) throw new RangeError("bad draw list: " + problems.join("; "));
    var buf = new Uint8Array(WIDTH * HEIGHT), pal = [], ramps = [], cycles = [];
    for (var i = 0; i < 256; i++) pal.push(i < 16 ? hex(PALETTE[i]) : [0, 0, 0]);

    function rect(x, y, w, h, c) {
      // Clip to the picture so a sloppy list cannot draw outside the 320x200 area.
      var x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(WIDTH, x + w), y1 = Math.min(HEIGHT, y + h);
      for (var j = y0; j < y1; j++) buf.fill(c, j * WIDTH + x0, j * WIDTH + Math.max(x0, x1));
    }
    function dot(x, y, c) { if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) buf[y * WIDTH + x] = c; }
    function line(x1, y1, x2, y2, c) {
      // Bresenham, so lines stay one hard pixel wide.
      var dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1);
      var sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1, err = dx + dy;
      for (;;) {
        dot(x1, y1, c);
        if (x1 === x2 && y1 === y2) break;
        var e2 = 2 * err;
        if (e2 >= dy) { err += dy; x1 += sx; }
        if (e2 <= dx) { err += dx; y1 += sy; }
      }
    }
    function poly(c, pts) {
      var n = pts.length / 2, minY = Infinity, maxY = -Infinity;
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
          if (to > from) rect(from, y, to - from, 1, c);
        }
      }
    }
    function rampOf(c) {
      for (var i = ramps.length - 1; i >= 0; i--) if (c >= ramps[i][0] && c <= ramps[i][1]) return ramps[i];
      return null;
    }
    // Moves one pixel `amount` steps along its own ramp, dithering the fraction.
    function shift(x, y, amount) {
      var at = y * WIDTH + x, c = buf[at], r = rampOf(c);
      if (!r) return;
      var whole = Math.floor(amount), s = whole + (amount - whole > threshold(x, y) ? 1 : 0);
      buf[at] = Math.max(r[0], Math.min(r[1], c + s));
    }

    for (var n = 0; n < list.length; n++) {
      var op = list[n], name = op[0], x, y, j, k;
      if (name === "fill") rect(0, 0, WIDTH, HEIGHT, op[1]);
      else if (name === "rect") rect(op[1], op[2], op[3], op[4], op[5]);
      else if (name === "line") line(op[1], op[2], op[3], op[4], op[5]);
      else if (name === "poly") poly(op[1], op[2]);
      else if (name === "dither") {
        rect(op[1], op[2], op[3], op[4], op[5]);
        for (j = 0; j < op[4]; j++) for (k = (j + op[1] + op[2]) & 1; k < op[3]; k += 2) dot(op[1] + k, op[2] + j, op[6]);
      } else if (name === "ellipse") {
        var rx = op[3], ry = op[4];
        for (j = -ry; j <= ry; j++) {
          var half = ry ? Math.round(rx * Math.sqrt(Math.max(0, 1 - (j * j) / (ry * ry + 0.25)))) : rx;
          rect(op[1] - half, op[2] + j, half * 2 + 1, 1, op[5]);
        }
      } else if (name === "pal") pal[op[1]] = hex(op[2]);
      else if (name === "ramp") {
        var a = hex(op[3]), b = hex(op[4]), steps = op[2] - op[1];
        for (k = 0; k <= steps; k++) {
          var t = steps ? k / steps : 0;
          pal[op[1] + k] = [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
        }
        ramps.push([op[1], op[2]]);
      } else if (name === "vgrad" || name === "hgrad") {
        var span = Math.max(1, (name === "vgrad" ? op[4] : op[3]) - 1);
        for (j = 0; j < op[4]; j++) for (k = 0; k < op[3]; k++) {
          x = op[1] + k; y = op[2] + j;
          var p = ((name === "vgrad" ? j : k) / span) * (op[6] - op[5]), base = Math.floor(p);
          dot(x, y, op[5] + base + (p - base > threshold(x, y) ? 1 : 0));
        }
      } else if (name === "light") {
        for (y = Math.max(0, op[2] - op[4]); y <= Math.min(HEIGHT - 1, op[2] + op[4]); y++) {
          for (x = Math.max(0, op[1] - op[3]); x <= Math.min(WIDTH - 1, op[1] + op[3]); x++) {
            var ex = (x - op[1]) / op[3], ey = (y - op[2]) / op[4], d = Math.sqrt(ex * ex + ey * ey);
            if (d < 1) shift(x, y, op[5] * (1 - d) * (1 - d));
          }
        }
      } else if (name === "shade") {
        for (y = Math.max(0, op[2]); y < Math.min(HEIGHT, op[2] + op[4]); y++) {
          for (x = Math.max(0, op[1]); x < Math.min(WIDTH, op[1] + op[3]); x++) shift(x, y, op[5]);
        }
      } else if (name === "text") {
        var scale = op[5] || 1, mirror = !!op[6], str = op[3];
        for (k = 0; k < str.length; k++) {
          var g = FONT[str[mirror ? str.length - 1 - k : k]];
          for (j = 0; j < 15; j++) {
            if (g[j] !== "1") continue;
            var col = j % 3;
            rect(op[1] + k * 4 * scale + (mirror ? 2 - col : col) * scale, op[2] + Math.floor(j / 3) * scale, scale, scale, op[4]);
          }
        }
      } else if (name === "cycle") cycles.push([op[1], op[2], op[3]]);
    }
    return { buf: buf, palette: pal, cycles: cycles, key: null };
  }

  // Colours a compiled picture onto the canvas at time t (ms). Skips the work when no cycle has moved.
  function present(ctx, pic, t) {
    var offsets = pic.cycles.map(function (c) { return Math.floor((t || 0) / c[2]) % (c[1] - c[0] + 1); });
    var key = offsets.join(",");
    if (key === pic.key && pic.ctx === ctx) return false;
    var pal = pic.palette.slice();
    pic.cycles.forEach(function (c, n) {
      var len = c[1] - c[0] + 1;
      for (var i = 0; i < len; i++) pal[c[0] + i] = pic.palette[c[0] + ((i - offsets[n]) % len + len) % len];
    });
    if (!pic.image || pic.ctx !== ctx) { pic.image = ctx.createImageData(WIDTH, HEIGHT); pic.ctx = ctx; }
    var d = pic.image.data, b = pic.buf;
    for (var i = 0; i < b.length; i++) { var p = pal[b[i]]; d[i * 4] = p[0]; d[i * 4 + 1] = p[1]; d[i * 4 + 2] = p[2]; d[i * 4 + 3] = 255; }
    ctx.putImageData(pic.image, 0, 0);
    pic.key = key;
    return true;
  }

  // Draws one still picture (cycles at their starting colours). `list` is a draw array.
  function drawPicture(ctx, list) {
    present(ctx, compile(list), 0);
  }

  // Checks a list without drawing; returns an array of problems (empty when fine). compile refuses a list
  // with problems, and the solver uses it to reject a world before certifying it.
  function validate(list) {
    var arity = {
      fill: [2], rect: [6], line: [6], poly: [3], dither: [7], ellipse: [6], pal: [3], ramp: [5],
      vgrad: [7], hgrad: [7], light: [6], shade: [6], text: [5, 6, 7], cycle: [4],
    };
    var problems = [];
    if (!Array.isArray(list)) return ["draw must be an array"];
    if (list.length > 2000) return ["draw has more than 2000 ops"];
    var isInt = Number.isInteger;
    function inRange(v) { return isInt(v) && v >= -1000 && v <= 1000; }
    function isColour(c) { return isInt(c) && c >= 0 && c <= 255; }
    function isHex(s) { return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s); }
    list.forEach(function (op, i) {
      var at = "op " + i + ": ", o = Array.isArray(op) ? op[0] : null;
      if (!Array.isArray(op) || !Object.prototype.hasOwnProperty.call(arity, o)) return problems.push(at + "unknown op");
      if (arity[o].indexOf(op.length) < 0) return problems.push(at + o + " takes " + arity[o].map(function (n) { return n - 1; }).join(" or ") + " arguments");
      var cols = { fill: [1], poly: [1], dither: [5, 6], rect: [5], line: [5], ellipse: [5], vgrad: [5, 6], hgrad: [5, 6], text: [4] }[o] || [];
      cols.forEach(function (n) { if (!isColour(op[n])) problems.push(at + "bad colour " + op[n]); });
      if (o === "rect" || o === "dither" || o === "vgrad" || o === "hgrad" || o === "shade") {
        if (![op[1], op[2], op[3], op[4]].every(inRange)) problems.push(at + "coordinates must be integers");
        else if (op[3] < 0 || op[4] < 0) problems.push(at + "negative size");
      } else if (o === "line") {
        if (![op[1], op[2], op[3], op[4]].every(inRange)) problems.push(at + "coordinates must be integers");
      } else if (o === "poly") {
        var pts = op[2];
        if (!Array.isArray(pts) || pts.length < 6 || pts.length % 2 || pts.length > 200) problems.push(at + "poly needs 3 to 100 x,y pairs");
        else if (!pts.every(inRange)) problems.push(at + "coordinates must be integers");
      } else if (o === "ellipse" || o === "light") {
        if (![op[1], op[2], op[3], op[4]].every(inRange)) problems.push(at + "coordinates must be integers");
        else if (op[3] < 0 || op[4] < 0 || (o === "light" && (op[3] < 1 || op[4] < 1))) problems.push(at + "bad radius");
      } else if (o === "pal") {
        if (!isInt(op[1]) || op[1] < 16 || op[1] > 255) problems.push(at + "pal defines colours 16..255 only");
        if (!isHex(op[2])) problems.push(at + "colour must be #rrggbb");
      } else if (o === "ramp" || o === "cycle") {
        if (!isInt(op[1]) || !isInt(op[2]) || op[1] < 16 || op[2] > 255 || op[2] < op[1] + (o === "cycle" ? 1 : 0)) problems.push(at + o + " needs a range within 16..255");
        if (o === "ramp" && !(isHex(op[3]) && isHex(op[4]))) problems.push(at + "colours must be #rrggbb");
        if (o === "cycle" && !(isInt(op[3]) && op[3] >= 16)) problems.push(at + "cycle period must be at least 16 ms");
      }
      if ((o === "light" || o === "shade") && !(typeof op[5] === "number" && isFinite(op[5]) && Math.abs(op[5]) <= 32)) problems.push(at + "steps must be a number within -32..32");
      if (o === "text") {
        if (![op[1], op[2]].every(inRange)) problems.push(at + "coordinates must be integers");
        if (typeof op[3] !== "string" || op[3].length > 80 || op[3].split("").some(function (ch) { return !Object.prototype.hasOwnProperty.call(FONT, ch); })) problems.push(at + "text must be up to 80 characters the font has");
        if (op.length > 5 && !(isInt(op[5]) && op[5] >= 1 && op[5] <= 8)) problems.push(at + "scale must be 1..8");
        if (op.length > 6 && typeof op[6] !== "boolean") problems.push(at + "mirror must be true or false");
      }
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

  return {
    WIDTH: WIDTH, HEIGHT: HEIGHT, PALETTE: PALETTE, compile: compile, present: present, drawPicture: drawPicture,
    validate: validate, toPicture: toPicture, hotspotAt: hotspotAt,
  };
})();

export const WIDTH = NightShiftRender.WIDTH, HEIGHT = NightShiftRender.HEIGHT, PALETTE = NightShiftRender.PALETTE;
export const compile = NightShiftRender.compile, present = NightShiftRender.present;
export const drawPicture = NightShiftRender.drawPicture, validate = NightShiftRender.validate;
export const toPicture = NightShiftRender.toPicture, hotspotAt = NightShiftRender.hotspotAt;
