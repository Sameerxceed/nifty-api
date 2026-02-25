// Vercel Serverless Function - fetches Yahoo Finance server-side
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

  const symbols = [
    "^NSEI","^NSEBANK","^INDIAVIX",
    "USDINR=X","CL=F","GC=F",
    "^DJI","^IXIC","^N225","^HSI","^FTSE"
  ].join(",");

  const fields = [
    "symbol","shortName",
    "regularMarketPrice","regularMarketChange","regularMarketChangePercent",
    "regularMarketDayHigh","regularMarketDayLow",
    "regularMarketOpen","regularMarketPreviousClose",
  ].join(",");

  async function getCrumb() {
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com/",
        },
      });
      const crumb = await r.text();
      const cookies = r.headers.get("set-cookie") || "";
      return { crumb: crumb.trim(), cookies };
    } catch(e) { return { crumb: "", cookies: "" }; }
  }

  async function fetchWithCrumb(crumb, cookies) {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
        "Cookie": cookies,
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return d?.quoteResponse?.result || [];
  }

  async function fetchDirect() {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com",
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return d?.quoteResponse?.result || [];
  }

  async function fetchV8() {
    const syms = ["^NSEI","^NSEBANK","^INDIAVIX","USDINR=X","CL=F","GC=F","^DJI","^IXIC","^N225","^HSI","^FTSE"];
    const results = await Promise.allSettled(syms.map(async sym => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Referer": "https://finance.yahoo.com",
        },
      });
      if (!r.ok) return null;
      const d = await r.json();
      const meta = d?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      return {
        symbol: sym,
        shortName: meta.symbol,
        regularMarketPrice: meta.regularMarketPrice,
        regularMarketChange: meta.regularMarketPrice - meta.chartPreviousClose,
        regularMarketChangePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
        regularMarketDayHigh: meta.regularMarketDayHigh || meta.regularMarketPrice,
        regularMarketDayLow: meta.regularMarketDayLow || meta.regularMarketPrice,
        regularMarketOpen: meta.regularMarketOpen || meta.chartPreviousClose,
        regularMarketPreviousClose: meta.chartPreviousClose,
      };
    }));
    return results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
  }

  let quotes = [];
  let method = "";

  try {
    const { crumb, cookies } = await getCrumb();
    if (crumb && !crumb.includes("Many Requests")) {
      quotes = await fetchWithCrumb(crumb, cookies);
      method = "crumb";
    }
  } catch(e) {}

  if (!quotes.length) {
    try { quotes = await fetchDirect(); method = "direct"; } catch(e) {}
  }

  if (!quotes.length) {
    try { quotes = await fetchV8(); method = "v8"; } catch(e) {}
  }

  if (!quotes.length) {
    return res.status(500).json({ ok: false, error: "All methods failed", ts: Date.now() });
  }

  const result = quotes.filter(Boolean).map(q => ({
    symbol:    q.symbol,
    name:      q.shortName || q.symbol,
    price:     q.regularMarketPrice,
    change:    q.regularMarketChange,
    changePct: q.regularMarketChangePercent,
    high:      q.regularMarketDayHigh,
    low:       q.regularMarketDayLow,
    open:      q.regularMarketOpen,
    prevClose: q.regularMarketPreviousClose,
  }));

  res.status(200).json({ ok: true, quotes: result, method, ts: Date.now() });
}
