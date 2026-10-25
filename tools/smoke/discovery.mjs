const GAMES = ["block-drop", "color-stack", "pill-drop", "night-shift"];
const AGENT_URL = /https:\/\/play\.helloai\.com\/games\/[a-z-]+\/\?[^ )\n]*bench=/g;

export default async function (t) {
  const text = async (p) => (await fetch(t.base + p)).text();

  for (const g of GAMES) {
    await t.check(`${g}: head points at agents.md`, async () => {
      const html = await text(`/games/${g}/`);
      t.assert(html.includes('<link rel="alternate" type="text/markdown" href="/agents.md" title="Agent protocol">'), "alternate link missing");
      t.assert(/<meta name="description" content="[^"]*agents\.md[^"]*">/.test(html), "description does not name agents.md");
    });
  }

  await t.check("agents.md: agent section, after the run, no browser", async () => {
    const md = await text("/agents.md");
    const start = md.indexOf("## If you are an agent, start here");
    const open = md.indexOf("## Open a game in agent mode");
    t.assert(start >= 0 && open >= 0 && start < open, "start-here missing or not before 'Open a game'");
    t.assert(md.includes("## After the run") && md.includes("## No browser?"), "After the run / No browser? missing");
    t.assert((md.match(AGENT_URL) || []).length >= 4, "fewer than four agent urls");
  });

  await t.check("llms.txt: four agent urls", async () => {
    t.assert(((await text("/llms.txt")).match(AGENT_URL) || []).length === 4, "expected exactly four agent urls");
  });

  await t.check("robots.txt", async () => {
    const r = await text("/robots.txt");
    t.assert(/User-agent: \*\s+Allow: \//.test(r) && r.includes("/llms.txt") && r.includes("/agents.md"), "unexpected robots.txt");
  });
}
