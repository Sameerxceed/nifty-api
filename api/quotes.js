// Vercel Serverless Function - fetches Yahoo Finance server-side
// No CORS issues, no proxies, always fast

export default async function handler(req, res) {
  // Allow requests from your GitHub Pages domain
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60"); // cache 30s on CDN

  const symbols = [
    "^NSEI",       // Nifty 50
    "^NSEBANK",    // Bank Nifty
    "^INDIAVIX",   // India VIX
    "USDINR=X",    // USD/INR
    "CL=F",        // Crude WTI
    "GC=F",        // Gold
    "^DJI",        // Dow Jones
    "^IXIC",       // Nasdaq
    "^N225",       // Nikkei
    "^HSI",        // Hang Seng
    "^FTSE",       // FTSE 100
  ].join(",");

  const fields = [
    "symbol","shortName",
    "regularMarketPrice","regularMarketChange","regularMarketChangePercent",
    "regularMarketDayHigh","regularMarketDayLow","regularMarketVolume",
    "regularMarketPreviousClose","regularMarketOpen",
    "fiftyTwoWeekHigh","fiftyTwoWeekLow",
  ].join(",");

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo returned ${response.status}`);
    }

    const data = await response.json();
    const quotes = data?.quoteResponse?.result || [];

    // Shape the response cleanly
    const result = quotes.map(q => ({
      symbol:   q.symbol,
      name:     q.shortName || q.symbol,
      price:    q.regularMarketPrice,
      change:   q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
      high:     q.regularMarketDayHigh,
      low:      q.regularMarketDayLow,
      open:     q.regularMarketOpen,
      prevClose: q.regularMarketPreviousClose,
      volume:   q.regularMarketVolume,
      week52High: q.fiftyTwoWeekHigh,
      week52Low:  q.fiftyTwoWeekLow,
    }));

    res.status(200).json({ ok: true, quotes: result, ts: Date.now() });

  } catch (err) {
    // Fallback: try query2
    try {
      const r2 = await fetch(url.replace("query1","query2"), {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const d2 = await r2.json();
      const quotes = d2?.quoteResponse?.result || [];
      res.status(200).json({ ok: true, quotes: quotes.map(q=>({
        symbol: q.symbol, name: q.shortName,
        price: q.regularMarketPrice, change: q.regularMarketChange,
        changePct: q.regularMarketChangePercent,
        high: q.regularMarketDayHigh, low: q.regularMarketDayLow,
        open: q.regularMarketOpen, prevClose: q.regularMarketPreviousClose,
      })), ts: Date.now() });
    } catch(e) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
}
