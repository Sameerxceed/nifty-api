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

  // First: check which models are available for this key
  const listRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`
  );
  const listData = await listRes.json();
  
  if (!listRes.ok) {
    return res.status(500).json({error: "Key invalid: " + (listData.error?.message || "unknown")});
  }

  // Get models that support generateContent
  const available = (listData.models || [])
    .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
    .map(m => m.name.replace("models/", ""));

  console.log("Available models:", available.join(", "));

  // Prefer flash models
  const preferred = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"];
  const toTry = [...preferred.filter(m => available.includes(m)), ...available.filter(m => !preferred.includes(m))];

  for (const model of toTry.slice(0, 3)) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
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
      if (!r.ok || d.error) { console.log(`${model} failed:`, d.error?.message); continue; }
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || null;
      if (!text) continue;
      console.log(`Success with ${model}`);
      return res.status(200).json({ok: true, text, model});
    } catch(e) { continue; }
  }

  res.status(500).json({error: "All models failed", available});
}
