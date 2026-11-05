const { createHmac } = require("node:crypto");

/**
 * Signed client for the app's internal endpoint. Every request carries
 * X-Prumo-Timestamp and X-Prumo-Signature = HMAC-SHA256(secret, `${ts}.${body}`).
 */
function createApi({ baseUrl, secret, timeoutMs = 20000 }) {
  if (!secret || secret.length < 32) throw new Error("INTERNAL_API_SECRET precisa ter ao menos 32 caracteres");
  const url = `${baseUrl.replace(/\/$/, "")}/api/internal/whatsapp`;

  async function call(payload) {
    const body = JSON.stringify(payload);
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Prumo-Timestamp": timestamp, "X-Prumo-Signature": signature },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  return {
    message: (phone, text, aiOutput, chatId) =>
      call({ op: "message", phone, text, ...(chatId ? { chatId } : {}), ...(aiOutput === undefined ? {} : { aiOutput }) }),
    execute: (phone, messageId, action) => call({ op: "execute", phone, messageId, action }),
    claim: (limit = 10) => call({ op: "outbox.claim", limit }),
    ack: (id, ok, error) => call({ op: "outbox.ack", id, ok, ...(error ? { error: String(error).slice(0, 300) } : {}) }),
  };
}

module.exports = { createApi };
