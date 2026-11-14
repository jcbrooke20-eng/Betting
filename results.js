// Vercel serverless function: returns finished NBA box-score lines for one date
// from BALLDONTLIE, so Daily Card can settle bets automatically.
const cache = {};

module.exports = async (req, res) => {
  const key = process.env.BALLDONTLIE_API_KEY;
  if (!key) return res.status(500).json({ error: "BALLDONTLIE_API_KEY isn’t set in your Vercel project settings." });
  const need = process.env.ACCESS_CODE;
  if (need && req.headers["x-access-code"] !== need) return res.status(401).json({ error: "Access code required." });

  const date = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Use ?date=YYYY-MM-DD" });
  if (cache[date] && Date.now() - cache[date].t < 10 * 60 * 1000) return res.status(200).json(cache[date].v);

  try {
    const rows = [];
    let cursor = null;
    for (let page = 0; page < 6; page++) {
      const u = new URL("https://api.balldontlie.io/nba/v1/stats");
      u.searchParams.append("dates[]", date);
      u.searchParams.set("per_page", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      const r = await fetch(u, { headers: { Authorization: key } });
      if (r.status === 429) return res.status(429).json({ error: "BALLDONTLIE rate limit (free plan: 5 requests a minute). Try again in a minute." });
      if (r.status === 401) return res.status(502).json({ error: "BALLDONTLIE rejected the key, or your plan doesn’t include player stats." });
      if (!r.ok) return res.status(502).json({ error: "BALLDONTLIE said " + r.status });
      const j = await r.json();
      (j.data || []).forEach((s) => {
        const st = s.game && s.game.status;
        rows.push({
          n: s.player.first_name + " " + s.player.last_name,
          p: s.pts || 0, r: s.reb || 0, a: s.ast || 0,
          m: parseInt(s.min, 10) || 0,
          f: typeof st === "string" ? (/final/i.test(st) ? 1 : 0) : null,
        });
      });
      cursor = j.meta && j.meta.next_cursor;
      if (!cursor) break;
    }
    const v = { date, rows };
    if (rows.length && rows.every((x) => x.f !== 0)) cache[date] = { t: Date.now(), v };
    return res.status(200).json(v);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
