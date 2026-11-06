require("dotenv").config();

const os = require("node:os");
const path = require("node:path");

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const { createAi } = require("./lib/ai");
const { createApi } = require("./lib/api");
const { createConversation } = require("./lib/conversation");

// ==================== CONFIG ====================
const APP_URL = process.env.PRUMO_APP_URL || "http://localhost:3000";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";
const AI_ENABLED = process.env.AI_ENABLED !== "false";
const OUTBOX_INTERVAL_MS = Number(process.env.OUTBOX_INTERVAL_MS || 30000);
// Outside the app folder: the WhatsApp browser profile changes every few seconds, and inside the
// project it makes `next dev` recompile in a loop.
const SESSION_PATH = process.env.WHATSAPP_SESSION_PATH || path.join(os.homedir(), ".prumo-bot", "session");

const api = createApi({ baseUrl: APP_URL, secret: (process.env.INTERNAL_API_SECRET || "").trim() });
const ai = AI_ENABLED ? createAi({ url: OLLAMA_URL, model: OLLAMA_MODEL }) : null;
const conversation = createConversation({ api, ai });

// ==================== CLIENTE WHATSAPP ====================
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "prumo-bot", dataPath: SESSION_PATH }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

let ready = false;

async function safeSend(chatId, text) {
  try {
    await withTimeout(client.sendMessage(chatId, text), 20000, "sendMessage");
    return true;
  } catch (error) {
    console.error(`Erro ao enviar para ${chatId}:`, describe(error));
    return false;
  }
}

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("\n📱 Escaneie o QR Code com o WhatsApp do número do bot");
});
client.on("authenticated", () => console.log("🔐 Sessão autenticada."));
client.on("auth_failure", (msg) => console.error("❌ Falha de autenticação:", msg));
client.on("disconnected", (reason) => {
  ready = false;
  console.warn("⚠️ Desconectado:", reason);
});
client.on("ready", () => {
  ready = true;
  console.log("✅ Bot Prumo conectado!");
  console.log(`🎯 App: ${APP_URL}`);
  console.log(`🤖 IA: ${AI_ENABLED ? `${OLLAMA_MODEL} em ${OLLAMA_URL}` : "desligada"}`);
});

/** WhatsApp Web calls can hang without throwing; never wait on them forever. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: sem resposta em ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** The sender's phone. Newer WhatsApp ids (@lid) hide it, so ask the contact first, then the lid map. */
async function senderPhone(msg) {
  const from = msg.from || "";
  if (from.endsWith("@c.us")) return from;
  try {
    const contact = await withTimeout(msg.getContact(), 8000, "getContact");
    if (contact && contact.number) return contact.number;
  } catch (error) {
    console.error("Não foi possível ler o contato:", describe(error));
  }
  try {
    const [pair] = await withTimeout(client.getContactLidAndPhone([from]), 8000, "getContactLidAndPhone");
    if (pair && pair.pn) return pair.pn;
  } catch (error) {
    console.error("Não foi possível resolver o @lid:", describe(error));
  }
  return null;
}

/** whatsapp-web.js rethrows minified browser errors ("r", "t"); keep the stack's first lines. */
function describe(error) {
  if (!error) return "erro desconhecido";
  const stack = String(error.stack || "").split("\n").slice(0, 3).join(" | ");
  return stack || error.message || String(error);
}

/** Stable id of a message for idempotency. Newer WhatsApp Web builds may leave _serialized empty. */
function messageIdOf(msg, chatId) {
  const id = (msg.id && (msg.id._serialized || msg.id.id)) || `${chatId}_${msg.timestamp || Date.now()}`;
  return String(id).slice(0, 200);
}

/** "digitando…" is cosmetic: newer WhatsApp Web builds can break getChat(), which must not block replies. */
async function showTyping(chatId) {
  try {
    const chat = await withTimeout(client.getChatById(chatId), 5000, "getChatById");
    await withTimeout(chat.sendStateTyping(), 5000, "sendStateTyping");
  } catch {
    // ignore
  }
}

// ==================== MENSAGENS ====================
client.on("message", async (msg) => {
  if (msg.fromMe) return;
  const chatId = msg.from || "";
  if (chatId.endsWith("@g.us") || chatId.endsWith("@newsletter") || chatId === "status@broadcast") return;
  const text = (msg.body || "").trim();
  if (!text) {
    if (msg.hasMedia) await safeSend(chatId, "📎 Por enquanto entendo só texto. Ex.: *gastei 45,90 no mercado*");
    return;
  }

  if (text === "/status") {
    await safeSend(chatId, `✅ Bot online\n🎯 App: ${APP_URL}\n🤖 IA: ${AI_ENABLED ? OLLAMA_MODEL : "desligada"}`);
    return;
  }

  console.log(`📩 Mensagem de ${chatId}: ${text.slice(0, 60)}`);
  const phone = await senderPhone(msg);
  console.log(`   número: ${phone ? `${String(phone).replace(/@.*/, "").slice(0, 4)}…` : "não identificado"}`);
  if (!phone) {
    await safeSend(chatId, "❌ Não consegui identificar seu número.");
    return;
  }

  showTyping(chatId);
  try {
    const reply = await conversation.handle({ chatId, phone, text, messageId: messageIdOf(msg, chatId) });
    if (reply) await safeSend(chatId, reply);
  } catch (error) {
    console.error("Erro ao processar mensagem:", describe(error));
    const text = error.status === 401 ? "❌ Bot sem autorização no app (confira INTERNAL_API_SECRET)." : "❌ O app não respondeu. Tente de novo em instantes.";
    await safeSend(chatId, text);
  }
});

// ==================== AVISOS (OUTBOX) ====================
let delivering = false;

async function deliverOutbox() {
  if (!ready || delivering) return;
  delivering = true;
  try {
    const { messages = [] } = await api.claim(10);
    for (const item of messages) {
      const digits = String(item.phone).replace(/\D/g, "");
      let ok = false;
      let error;
      try {
        // Prefer the chat the user linked from (works for @lid ids). Older links only have a phone:
        // getNumberId resolves it (e.g. Brazilian numbers with/without the 9th digit).
        let target = item.chatId;
        if (!target) {
          const numberId = await withTimeout(client.getNumberId(digits), 10000, "getNumberId");
          if (!numberId) throw new Error("Número sem WhatsApp");
          target = numberId._serialized;
        }
        ok = await safeSend(target, item.text);
        if (!ok) error = "Falha no envio";
      } catch (e) {
        error = e.message;
      }
      await api.ack(item.id, ok, error).catch((e) => console.error("Falha ao confirmar aviso:", e.message));
    }
    if (messages.length) console.log(`📬 ${messages.length} aviso(s) processado(s)`);
  } catch (error) {
    console.error("Erro ao buscar avisos:", describe(error));
  } finally {
    delivering = false;
  }
}

setInterval(deliverOutbox, OUTBOX_INTERVAL_MS);

// ==================== START ====================
console.log("🚀 Iniciando bot WhatsApp do Prumo...");
client.initialize();

process.on("SIGINT", async () => {
  console.log("\nEncerrando...");
  await client.destroy().catch(() => {});
  process.exit(0);
});
