/* Netlify Function: grounded chess coach via Google Gemini.
 *
 * This is only a FALLBACK proxy for browsers that block the direct
 * call to Google. The app normally calls Gemini straight from the
 * browser with the *user's own* API key, so your deployment ships no
 * key and spends none of your quota.
 *
 * The key is taken from the request body (the user's key). As an
 * optional convenience, a GEMINI_API_KEY env var is used if no key is
 * supplied — leave it unset to require each user to bring their own.
 * Optional: GEMINI_MODEL (default "gemini-2.0-flash").
 */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "POST only" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "bad JSON" }) }; }

  const key = (body.apiKey && body.apiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!key) {
    return { statusCode: 400, body: JSON.stringify({ error: "no API key provided" }) };
  }

  const { question, facts } = body;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const system =
    "You are a friendly, concise chess coach for a club-level player. " +
    "Use ONLY the FACTS below — they come from a chess engine and are correct. " +
    "Never invent moves, evaluations, or variations that are not in FACTS. " +
    "If FACTS don't answer the question, give general guidance based on the eval " +
    "components provided. Keep replies under 90 words, concrete and encouraging. " +
    "Refer to moves in standard notation.";

  const prompt =
    `${system}\n\nFACTS (JSON):\n${JSON.stringify(facts, null, 2)}\n\n` +
    `PLAYER QUESTION: ${question || "Coach me on this position."}`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
      })
    });
    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 300);
      return { statusCode: 502, body: JSON.stringify({ error: "gemini " + resp.status, detail }) };
    }
    const data = await resp.json();
    const text = (data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts || [])
      .map((p) => p.text).join("").trim();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
