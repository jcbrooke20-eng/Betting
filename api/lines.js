const BASE = "https://api.the-odds-api.com/v4/sports/basketball_nba";
const STATS = {
  player_points: "PTS",
  player_rebounds: "REB",
  player_assists: "AST",
  player_points_rebounds_assists: "PRA",
};
const fmt = (p) => (p > 0 ? "+" + p : String(p));
let cache = {};

async function call(path, params) {
  const u = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  if (!r.ok) throw new Error("The Odds API said " + r.status + ": " + (await r.text()).slice(0, 200));
  return { data: await r.json(), rem: r.headers.get("x-requests-remaining") };
}

module.exports = async (req, res) => {
  const key = process.env.ODDS_API_KEY;
  if (!key) return res.status(500).json({ error: "ODDS_API_KEY isn’t set in your Vercel project settings." });
  const need = process.env.ACCESS_CODE;
  if (need && req.headers["x-access-code"] !== need) return res.status(401).json({ error: "Access code required." });

  const hours = Math.min(48, parseInt(req.query.hours, 10) || 24);
  const markets = (req.query.markets || Object.keys(STATS).join(","))
    .split(",").filter((m) => STATS[m]).join(",") || Object.keys(STATS).join(",");
  const ck = hours + "|" + markets;
  if (cache[ck] && Date.now() - cache[ck].t < 5 * 60 * 1000) {
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json(cache[ck].v);
  }

  try {
    const ev = await call("/events", { apiKey: key });
    const now = Date.now();
    const games = ev.data.filter((e) => {
      const t = Date.parse(e.commence_time);
      return t >= now - 36e5 && t <= now + hours * 36e5;
    });
    if (!games.length) return res.status(404).json({ error: "No NBA games in the next " + hours + " hours." });

    const results = await Promise.all(games.map((g) =>
      call("/events/" + g.id + "/odds", {
        apiKey: key, regions: "us", markets, bookmakers: "draftkings", oddsFormat: "american",
      })));

    const rows = [];
    let rem = ev.rem;
    results.forEach(({ data, rem: r }) => {
      if (r != null) rem = r;
      const pairs = {};
      (data.bookmakers || []).forEach((bk) => (bk.markets || []).forEach((m) => {
        const stat = STATS[m.key];
        if (!stat) return;
        (m.outcomes || []).forEach((o) => {
          const k = o.description + "|" + stat + "|" + o.point;
          (pairs[k] = pairs[k] || {})[o.name] = o.price;
        });
      }));
      Object.entries(pairs).forEach(([k, s]) => {
        if (s.Over == null || s.Under == null) return;
        const [player, stat, line] = k.split("|");
        rows.push([player, stat, line, s.Over, s.Under]);
      });
    });
    if (!rows.length) return res.status(404).json({ error: "Games found, but DraftKings hasn’t posted two-sided props yet. Try closer to tip-off." });

    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    const v = {
      lines: rows.map((r) => r[0] + ", " + r[1] + ", " + r[2] + ", " + fmt(r[3]) + ", " + fmt(r[4])).join("\n"),
      count: rows.length, games: games.length, remaining: rem,
    };
    cache[ck] = { t: Date.now(), v };
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json(v);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
