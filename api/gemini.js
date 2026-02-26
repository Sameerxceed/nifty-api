export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({error:"Method not allowed"}); return; }

  const GEMINI_KEY = process.env.GEMINI_KEY;
  if (!GEMINI_KEY) { res.status(500).json({error:"GEMINI_KEY not configured"}); return; }

  const { prompt, json } = req.body || {};
  if (!prompt) { res.status(400).json({error:"prompt required"}); return; }

  const finalPrompt = prompt + (json ? "\n\nReturn ONLY valid JSON. No markdown, no backticks. Raw JSON only." : "");

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          contents: [{parts: [{text: finalPrompt}]}],
          generationConfig: {temperature: 0.3, maxOutputTokens: 2000}
        })
      }
    );

    const d = await r.json();
    if (!r.ok || d.error) {
      return res.status(r.status).json({error: d.error?.message || "Gemini error"});
    }

    const text = d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    res.status(200).json({ok: true, text});

  } catch(e) {
    res.status(500).json({error: e.message});
  }
}
