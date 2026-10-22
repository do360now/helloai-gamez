// Visitor counter (api/views.php, same scheme as helloai.com and do360now.com).
// Counts this visit once for the game in the URL (games/<slug>/, or "home" for the arcade page),
// then refreshes every minute. Any error (no PHP, opened from disk, bad reply) hides the badge.
(function () {
  var match = location.pathname.match(/^\/(?:games\/([a-z0-9][a-z0-9-]*)\/)?(index\.html)?$/);
  if (!match || !window.fetch) return;
  if (/[?&]embed=1(&|$)/.test(location.search)) return;   // the home page's replay player is not a visit
  var game = match[1] || "home";
  var url = "/api/views.php?game=" + encodeURIComponent(game);
  var badge = document.createElement("div");
  badge.hidden = true;
  badge.setAttribute("aria-live", "off");
  badge.style.cssText = "position:fixed;bottom:8px;right:8px;z-index:2147483647;pointer-events:none;" +
    "font:600 10px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#fffc;" +
    "background:#0009;border:1px solid #fff3;border-radius:999px;padding:2px 8px;white-space:nowrap";
  var counted = false;

  async function poll() {
    try {
      var response = await fetch(url, {method: counted ? "GET" : "POST", cache: "no-store"});
      if (!response.ok) throw new Error("Views " + response.status);
      var views = await response.json();
      if (!Number.isFinite(views.views) || !Number.isFinite(views.total) || views.views < 0) throw new Error("Invalid views");
      counted = true;
      badge.textContent = views.views.toLocaleString("en-US") + (views.views === 1 ? " VISITOR" : " VISITORS");
      badge.title = "One per visitor per day, counted since " + new Date(views.since).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}) +
        " (" + views.total.toLocaleString("en-US") + " across all games)";
      if (!badge.isConnected) document.body.appendChild(badge);
      badge.hidden = false;
    } catch (e) { badge.hidden = true; }
  }

  poll();
  setInterval(poll, 60000);
})();
