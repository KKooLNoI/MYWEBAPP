export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: "symbols required" });

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&lang=en-US&region=US`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await r.json();
    const quotes = (data?.quoteResponse?.result || []).map(q => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
      currency: q.currency,
    }));
    res.status(200).json({ quotes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
