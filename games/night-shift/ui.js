// Night Shift human UI. Reads game.state() and repaints after every applied command; never calls the
// engine except through submit(), which goes through Arcade.onKeyAction so a typed or tapped command
// is logged exactly like an agent's.
import * as Render from "./render.js";

export function mount(root, game, world, submit) {
  var $ = function (id) { return root.querySelector("#" + id); };
  var canvas = $("scene"), ctx = canvas.getContext("2d");
  var bar = $("scorebar"), log = $("log"), verbsEl = $("verbs"), exitsEl = $("exits"), form = $("cmdform"), input = $("cmd");
  var invEl = $("inventory");
  var pending = null; // a verb chosen by tap, waiting for a noun
  var history = [], hpos = 0;
  var s = null;

  function pad(n, w) { return String(n).padStart(w, "0"); }

  function button(label, title, onClick, cls) {
    var b = document.createElement("button");
    b.type = "button"; b.textContent = label; if (title) b.title = title; if (cls) b.className = cls;
    b.addEventListener("click", onClick);
    return b;
  }

  function send(text) {
    if (!text.trim()) return;
    history.push(text); hpos = history.length;
    pending = null;
    submit(text);
  }

  // A verb button either sends a bare verb ("look", "inventory") or waits for a tapped object or typed noun.
  function verbClick(v) {
    var bare = !/</.test(v.usage || "");
    if (bare) return send(v.verb);
    pending = pending === v.verb ? null : v.verb;
    input.value = pending ? pending + " " : "";
    input.focus();
    paintVerbs();
  }

  function paintVerbs() {
    verbsEl.textContent = "";
    s.verbs.forEach(function (v) {
      var b = button(v.verb, v.usage, function () { verbClick(v); }, pending === v.verb ? "on" : "");
      verbsEl.appendChild(b);
    });
  }

  function paintExits() {
    exitsEl.textContent = "";
    s.exits.forEach(function (e) {
      exitsEl.appendChild(button(e.dir, e.name || e.to, function () { send(e.dir); }));
    });
    if (!s.exits.length) exitsEl.textContent = "none";
  }

  function paintInventory() {
    invEl.textContent = "";
    s.inventory.forEach(function (it) {
      invEl.appendChild(button(it.name, "use or look at " + it.name, function () {
        if (pending) send(pending + " " + it.name); else send("look at " + it.name);
      }));
    });
    if (!s.inventory.length) invEl.textContent = "nothing";
  }

  function paintLog() {
    log.textContent = "";
    var rows = s.transcript.slice(-40);
    rows.forEach(function (t) {
      if (t.cmd) { var c = document.createElement("p"); c.className = "cmd"; c.textContent = "> " + t.cmd; log.appendChild(c); }
      var p = document.createElement("p"); p.textContent = t.reply; log.appendChild(p);
    });
    log.scrollTop = log.scrollHeight;
  }

  function paint() {
    s = game.state();
    var room = world.rooms[s.room.id];
    try { Render.drawPicture(ctx, (room && room.draw) || [["fill", 0]]); } catch (e) { ctx.fillStyle = "#aa0000"; ctx.fillRect(0, 0, 320, 200); }
    bar.textContent = "Score: " + s.score + " of " + s.maxScore + "   |   " + s.room.name + "   |   Turn " + s.turn + (s.budget ? "/" + s.budget : "") + (s.deaths ? "   |   Deaths " + s.deaths : "");
    paintLog(); paintVerbs(); paintExits(); paintInventory();
    form.classList.toggle("over", !!s.over);
    input.disabled = !!s.over;
    $("overbanner").hidden = !s.over;
  }

  // Tapping the scene: the hotspot's object, with the selected verb or "look at".
  canvas.addEventListener("click", function (ev) {
    if (!s || s.over) return;
    var p = Render.toPicture(canvas, ev.clientX, ev.clientY);
    var hit = null;
    for (var i = 0; i < s.objects.length; i++) {
      var o = s.objects[i], h = o.hotspot;
      if (h && Render.hotspotAt([{ rect: h, o: o }], p.x, p.y)) { hit = o; break; }
    }
    if (hit) send((pending || "look at") + " " + (hit.nouns && hit.nouns[0] || hit.name));
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var t = input.value; input.value = "";
    send(t);
  });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowUp" && history.length) { hpos = Math.max(0, hpos - 1); input.value = history[hpos]; ev.preventDefault(); }
    else if (ev.key === "ArrowDown" && history.length) { hpos = Math.min(history.length, hpos + 1); input.value = history[hpos] || ""; ev.preventDefault(); }
    else if (ev.key === "Escape") { pending = null; input.value = ""; if (s) paintVerbs(); }
  });

  paint();
  return { repaint: paint };
}
