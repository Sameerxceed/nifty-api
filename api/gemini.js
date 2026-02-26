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

  // Try models in order until one works
  const models = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-pro",
  ];

  for (const model of models) {
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

      if (!r.ok || d.error) {
        console.log(`Model ${model} failed:`, d.error?.message);
        continue; // try next model
      }

      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || null;
      if (!text) continue;

      console.log(`Model ${model} succeeded`);
      return res.status(200).json({ok: true, text, model});

    } catch(e) {
      console.log(`Model ${model} exception:`, e.message);
      continue;
    }
  }

  res.status(500).json({error:"All models failed. Check API key quota."});
}
