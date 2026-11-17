require("dotenv").config();

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const pino = require("pino");
const qrcode = require("qrcode-terminal");

const { createAi } = require("./lib/ai");
const { createApi } = require("./lib/api");
const { createConversation } = require("./lib/conversation");
const { hasMedia, isPersonalChat, phoneOf, textOf, toAppChatId, toBaileysJid } = require("./lib/jid");

// ==================== CONFIG ====================
const APP_URL = process.env.PRUMO_APP_URL || "http://localhost:3000";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";
const AI_ENABLED = process.env.AI_ENABLED !== "false";
const OUTBOX_INTERVAL_MS = Number(process.env.OUTBOX_INTERVAL_MS || 30000);
const HEALTH_INTERVAL_MS = Number(process.env.HEALTH_INTERVAL_MS || 5 * 60 * 1000);
// Outside the app folder: the session keys change often, and inside the project they make
// `next dev` recompile in a loop.
const AUTH_PATH = process.env.WHATSAPP_AUTH_PATH || path.join(os.homedir(), ".prumo-bot", "baileys");
// With a number (digits, country code first), linking uses an 8-character code instead of a QR.
const PAIRING_NUMBER = (process.env.WHATSAPP_PAIRING_NUMBER || "").replace(/\D/g, "");
// Messages that waited longer than this while the bot was offline are skipped, not answered late.
const MAX_MESSAGE_AGE_S = 12 * 60 * 60;

const api = createApi({ baseUrl: APP_URL, secret: (process.env.INTERNAL_API_SECRET || "").trim() });
const ai = AI_ENABLED ? createAi({ url: OLLAMA_URL, model: OLLAMA_MODEL }) : null;
const conversation = createConversation({ api, ai });
const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || "warn" });

/** Baileys is an ES module; this file stays CommonJS like the rest of the bot. */
let B;
let sock = null;
let ready = false;
let registered = false;
let lastOpenAt = 0;
let lastChangeAt = Date.now();
let pairingRequested = false;
let reconnectDelay = 2000;
let failedSends = 0;

// Sent messages, for WhatsApp's retry requests (a phone that could not decrypt asks again).
const sent = new Map();
function remember(message) {
  if (!message?.key?.id || !message.message) return;
  sent.set(message.key.id, message.message);
  if (sent.size > 500) sent.delete(sent.keys().next().value);
}

/** Network calls can hang without throwing; never wait on them forever. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: sem resposta em ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function describe(error) {
  if (!error) return "erro desconhecido";
  return String(error.stack || error.message || error).split("\n").slice(0, 3).join(" | ");
}

/** Last resort: exit and let Docker (restart: unless-stopped) start a fresh process with the saved session. */
function restart(reason) {
  console.error(`🔄 Reiniciando o bot: ${reason}`);
  try {
    sock?.end(undefined);
  } catch {
    // ignore
  }
  process.exit(1);
}

async function safeSend(jid, text) {
  try {
    if (!sock || !ready) throw new Error("WhatsApp desconectado");
    remember(await withTimeout(sock.sendMessage(jid, { text }), 20000, "sendMessage"));
    failedSends = 0;
    return true;
  } catch (error) {
    console.error(`Erro ao enviar para ${jid}:`, describe(error));
    failedSends += 1;
    if (failedSends >= 3) restart(`${failedSends} envios seguidos falharam`);
    return false;
  }
}

/** The sender's phone digits. Hidden-number chats (@lid) carry it in remoteJidAlt or in Baileys' lid map. */
async function senderPhone(jid, key) {
  const direct = phoneOf(jid) || phoneOf(key.remoteJidAlt);
  if (direct) return direct;
  if (!B.isLidUser(jid)) return null;
  try {
    return phoneOf(await withTimeout(sock.signalRepository.lidMapping.getPNForLID(jid), 8000, "getPNForLID"));
  } catch (error) {
    console.error("Não foi possível resolver o @lid:", describe(error));
    return null;
  }
}

/** Duplicates can arrive after a reconnect; handle each message id once. */
const handled = new Set();
function firstTime(id) {
  if (handled.has(id)) return false;
  handled.add(id);
  if (handled.size > 1000) handled.delete(handled.values().next().value);
  return true;
}

// ==================== MENSAGENS ====================
async function handleMessage(m) {
  const key = m.key || {};
  if (key.fromMe || !key.id) return;
  const jid = B.jidNormalizedUser(key.remoteJid);
  if (!isPersonalChat(jid)) return;
  const content = B.normalizeMessageContent(m.message);
  if (!content || content.protocolMessage || content.reactionMessage) return;
  if (!firstTime(key.id)) return;
  const sentAt = Number(m.messageTimestamp || 0);
  if (sentAt && Date.now() / 1000 - sentAt > MAX_MESSAGE_AGE_S) return;

  const text = textOf(content).trim();
  if (!text) {
    if (hasMedia(content)) await safeSend(jid, "📎 Por enquanto entendo só texto. Ex.: *gastei 45,90 no mercado*");
    return;
  }

  if (text === "/status") {
    await safeSend(jid, `✅ Bot online\n🎯 App: ${APP_URL}\n🤖 IA: ${AI_ENABLED ? OLLAMA_MODEL : "desligada"}`);
    return;
  }

  console.log(`📩 Mensagem de ${jid}: ${text.slice(0, 60)}`);
  const phone = await senderPhone(jid, key);
  console.log(`   número: ${phone ? `${phone.slice(0, 4)}…` : "não identificado"}`);
  if (!phone) {
    await safeSend(jid, "❌ Não consegui identificar seu número.");
    return;
  }

  // "digitando…" is cosmetic and must never block the reply.
  sock.sendPresenceUpdate("composing", jid).catch(() => {});
  try {
    const reply = await conversation.handle({ chatId: toAppChatId(jid) || jid, phone, text, messageId: String(key.id).slice(0, 200) });
    if (reply) await safeSend(jid, reply);
  } catch (error) {
    console.error("Erro ao processar mensagem:", describe(error));
    const answer = error.status === 401 ? "❌ Bot sem autorização no app (confira INTERNAL_API_SECRET)." : "❌ O app não respondeu. Tente de novo em instantes.";
    await safeSend(jid, answer);
  } finally {
    sock.sendPresenceUpdate("paused", jid).catch(() => {});
  }
}

// ==================== CONEXÃO ====================
async function onConnection({ connection, lastDisconnect, qr }) {
  if (connection) lastChangeAt = Date.now();
  if (qr) {
    if (PAIRING_NUMBER) {
      if (pairingRequested) return;
      pairingRequested = true;
      try {
        const code = await sock.requestPairingCode(PAIRING_NUMBER);
        console.log(`\n🔑 Código de pareamento: ${code.match(/.{1,4}/g).join("-")}`);
        console.log("No celular do bot: WhatsApp › Dispositivos conectados › Conectar dispositivo › Conectar com número de telefone.");
      } catch (error) {
        pairingRequested = false;
        console.error("Não foi possível pedir o código de pareamento:", describe(error));
      }
    } else {
      qrcode.generate(qr, { small: true });
      console.log("\n📱 Escaneie o QR Code com o WhatsApp do número do bot");
    }
  }

  if (connection === "open") {
    ready = true;
    registered = true;
    lastOpenAt = Date.now();
    reconnectDelay = 2000;
    console.log("✅ Bot Prumo conectado!");
    console.log(`🎯 App: ${APP_URL}`);
    console.log(`🤖 IA: ${AI_ENABLED ? `${OLLAMA_MODEL} em ${OLLAMA_URL}` : "desligada"}`);
  }

  if (connection === "close") {
    ready = false;
    const code = lastDisconnect?.error?.output?.statusCode;
    if (code === B.DisconnectReason.loggedOut) {
      // The bot was removed from "Dispositivos conectados": the saved keys are useless now.
      console.error("❌ Sessão encerrada no celular. Apagando a sessão; será preciso conectar de novo.");
      await fs.rm(AUTH_PATH, { recursive: true, force: true }).catch(() => {});
      registered = false;
      pairingRequested = false;
    } else {
      console.warn(`⚠️ Conexão fechada (${code ?? "sem código"}): ${lastDisconnect?.error?.message ?? ""}`);
    }
    // Right after linking WhatsApp asks for a restart (515); otherwise back off up to a minute.
    const delay = code === B.DisconnectReason.restartRequired ? 0 : reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    setTimeout(() => connect().catch((error) => restart(`falha ao reconectar: ${describe(error)}`)), delay);
  }
}

async function connect() {
  await fs.mkdir(AUTH_PATH, { recursive: true });
  const { state, saveCreds } = await B.useMultiFileAuthState(AUTH_PATH);
  registered = Boolean(state.creds.registered);
  // The newest WhatsApp Web version avoids "405" refusals; the bundled one is the fallback.
  const latest = await withTimeout(B.fetchLatestBaileysVersion(), 10000, "fetchLatestBaileysVersion").catch(() => null);
  sock = B.makeWASocket({
    ...(latest?.version ? { version: latest.version } : {}),
    auth: { creds: state.creds, keys: B.makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    getMessage: async (key) => sent.get(key.id),
  });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => onConnection(update).catch((error) => console.error("Erro na conexão:", describe(error))));
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) handleMessage(m).catch((error) => console.error("Erro ao tratar mensagem:", describe(error)));
  });
}

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
        // onWhatsApp resolves it (e.g. Brazilian numbers with/without the 9th digit).
        let target = item.chatId ? toBaileysJid(item.chatId) : null;
        if (!target) {
          const [found] = (await withTimeout(sock.onWhatsApp(digits), 10000, "onWhatsApp")) || [];
          if (!found?.exists) throw new Error("Número sem WhatsApp");
          target = found.jid;
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

// ==================== VIGIA DA CONEXÃO ====================
// Baileys reconnects by itself. If a linked bot stays offline for 15 minutes anyway, start over.
setInterval(() => {
  if (ready || !registered) return;
  if (Date.now() - Math.max(lastChangeAt, lastOpenAt) > 15 * 60 * 1000) restart("sem conexão há 15 minutos");
}, HEALTH_INTERVAL_MS);

// ==================== START ====================
async function main() {
  console.log("🚀 Iniciando bot WhatsApp do Prumo...");
  B = await import("baileys");
  await connect();
  setInterval(deliverOutbox, OUTBOX_INTERVAL_MS);
}

function shutdown() {
  console.log("\nEncerrando...");
  try {
    // end() closes the connection without logging out: the session stays valid.
    sock?.end(undefined);
  } catch {
    // ignore
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((error) => {
  console.error("Falha ao iniciar:", describe(error));
  process.exit(1);
});
