import { test } from "node:test";
import assert from "node:assert/strict";
import { loadWorld, pictureProblems } from "../night-shift.mjs";
import { PICTURES } from "../../games/night-shift/pictures.js";
import { compile, present, validate, drawPicture } from "../../games/night-shift/render.js";

const world = await loadWorld();
const canvas = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData(img) { this.img = img; this.puts = (this.puts || 0) + 1; } });

test("every room has a picture that compiles, and every picture has a room", () => {
  assert.deepEqual(pictureProblems(world), []);
  for (const [rid, list] of Object.entries(PICTURES)) {
    const pic = compile(list);
    assert.ok(new Set(pic.buf).size > 16, rid + " uses only a handful of colours");
  }
});

test("pictureProblems reports a missing picture and a stray one", () => {
  const pics = { ...PICTURES, attic: [["fill", 0]] };
  delete pics.van;
  const p = pictureProblems(world, pics);
  assert.ok(p.some((x) => /room van has no picture/.test(x)), p.join("; "));
  assert.ok(p.some((x) => /picture attic has no room/.test(x)), p.join("; "));
});

test("the old 16-colour draw lists still render, pixel for pixel in EGA colours", () => {
  const ctx = canvas();
  drawPicture(ctx, world.rooms.floor.draw);
  const d = ctx.img.data;
  assert.deepEqual([d[0], d[1], d[2]], [0, 0, 0xaa]); // fill 1: EGA blue
});

test("palette cycling re-colours only when a cycle moves", () => {
  const pic = compile([["fill", 16], ["pal", 16, "#ff0000"], ["pal", 17, "#0000ff"], ["cycle", 16, 17, 100]]);
  const ctx = canvas();
  assert.equal(present(ctx, pic, 0), true);
  assert.deepEqual([...ctx.img.data.slice(0, 3)], [255, 0, 0]);
  assert.equal(present(ctx, pic, 50), false);
  assert.equal(present(ctx, pic, 100), true);
  assert.deepEqual([...ctx.img.data.slice(0, 3)], [0, 0, 255]);
});

test("light moves pixels along their own ramp and leaves other colours alone", () => {
  const pic = compile([["ramp", 16, 31, "#000000", "#f0f0f0"], ["fill", 18], ["rect", 0, 0, 1, 1, 4], ["light", 0, 0, 40, 40, 8]]);
  assert.equal(pic.buf[0], 4);
  assert.ok(pic.buf[1] > 18 && pic.buf[1] <= 31);
  assert.equal(pic.buf[199 * 320 + 319], 18);
});

test("validate rejects bad new ops", () => {
  assert.ok(validate([["pal", 3, "#ffffff"]]).length, "pal may not redefine EGA colours");
  assert.ok(validate([["ramp", 20, 10, "#000000", "#ffffff"]]).length);
  assert.ok(validate([["cycle", 20, 24, 5]]).length);
  assert.ok(validate([["text", 0, 0, "lower", 15]]).length);
  assert.ok(validate([["light", 0, 0, 0, 5, 2]]).length);
  assert.ok(validate([["rect", 0, 0, 4, 4, 256]]).length);
  assert.deepEqual(validate([["ramp", 16, 31, "#000000", "#ffffff"], ["vgrad", 0, 0, 10, 10, 16, 31], ["text", 1, 1, "OK 1.50", 15, 2, true]]), []);
});
