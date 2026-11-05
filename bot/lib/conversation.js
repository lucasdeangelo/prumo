/**
 * Conversation state machine, independent of WhatsApp so it can be tested.
 * A proposal waits for "sim"/"nao" for a few minutes. The id of the message that created the
 * proposal is the idempotency key, so a retried "sim" never saves twice.
 */
const YES = new Set(["sim", "s", "ok", "confirmar", "confirma", "isso", "pode", "👍", "✅"]);
const NO = new Set(["nao", "não", "n", "cancelar", "cancela", "❌"]);
const PENDING_TTL_MS = 5 * 60 * 1000;

function normalize(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function createConversation({ api, ai, today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) }) {
  const pending = new Map();

  async function handle({ chatId, phone, text, messageId }) {
    const clean = normalize(text);
    if (!clean) return null;

    if (clean === "/cancelar") {
      const had = pending.delete(chatId);
      return had ? "❌ Operação cancelada." : "ℹ️ Não há operação pendente.";
    }

    const waiting = pending.get(chatId);
    if (waiting && waiting.expiresAt > Date.now()) {
      if (YES.has(clean)) {
        pending.delete(chatId);
        const result = await api.execute(phone, waiting.messageId, waiting.action);
        return result.text;
      }
      if (NO.has(clean) || clean === "nao.") {
        pending.delete(chatId);
        return "❌ Cancelado. Nada foi salvo.";
      }
      // Anything else starts over: the old proposal is dropped.
      pending.delete(chatId);
    } else if (waiting) {
      pending.delete(chatId);
    }

    let result = await api.message(phone, text, undefined, chatId);
    if (result.kind === "needs_ai") {
      if (!ai) return "❓ Não entendi. Tente: *gastei 45,90 no mercado* ou envie *ajuda*.";
      const output = await ai.extract(result.systemPrompt, text, today());
      if (!output) return "❓ Não consegui entender. Tente: *gastei 45,90 no mercado*.";
      result = await api.message(phone, text, output, chatId);
    }
    if (result.kind === "confirm") {
      pending.set(chatId, { action: result.action, messageId, expiresAt: Date.now() + PENDING_TTL_MS });
    }
    return result.text || null;
  }

  return { handle, pending };
}

module.exports = { createConversation, normalize };
