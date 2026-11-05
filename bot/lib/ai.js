/**
 * Small local model via Ollama, used only when the app's deterministic parser cannot read a message.
 * Output is untrusted: the app validates it again before proposing anything.
 */
function createAi({ url, model, timeoutMs = 45000 }) {
  async function extract(systemPrompt, text, today) {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          stream: false,
          keep_alive: "30m",
          format: "json",
          messages: [
            { role: "system", content: `${systemPrompt}\nHoje é ${today}.` },
            { role: "user", content: text.slice(0, 500) },
          ],
          options: { temperature: 0.1, num_ctx: 1024, num_predict: 120 },
        }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const data = await response.json();
      console.log(`⏱️ IA respondeu em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      return parseJson(data?.message?.content);
    } catch (error) {
      console.error("IA indisponível:", error.message);
      return null;
    }
  }
  return { extract };
}

function parseJson(text) {
  if (!text || typeof text !== "string") return null;
  const clean = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

module.exports = { createAi, parseJson };
