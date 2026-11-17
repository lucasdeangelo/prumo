/**
 * WhatsApp ids, between Baileys and the app.
 *
 * Baileys writes a phone chat as "5511999990000@s.whatsapp.net" (sometimes with a device suffix,
 * "5511999990000:12@s.whatsapp.net") and a hidden-number chat as "123456789@lid". The app stores
 * the format the bot used before Baileys ("5511999990000@c.us" or "123456789@lid"), so links made
 * then keep working: this module converts both ways.
 */

/** "5511999990000:12@s.whatsapp.net" → { user: "5511999990000", server: "s.whatsapp.net" }. */
function splitJid(jid) {
  const at = String(jid || "").lastIndexOf("@");
  if (at < 1) return null;
  const user = jid.slice(0, at).split(":")[0];
  const server = jid.slice(at + 1);
  return user && server ? { user, server } : null;
}

/** Only one-to-one chats get answers: no groups, broadcast lists, status or channels. */
function isPersonalChat(jid) {
  const parts = splitJid(jid);
  return Boolean(parts) && (parts.server === "s.whatsapp.net" || parts.server === "c.us" || parts.server === "lid");
}

/** The app's chat id for a Baileys jid ("…@c.us" or "…@lid"), or null when it is not a person. */
function toAppChatId(jid) {
  const parts = splitJid(jid);
  if (!parts || !/^[0-9]{6,20}$/.test(parts.user)) return null;
  if (parts.server === "s.whatsapp.net" || parts.server === "c.us") return `${parts.user}@c.us`;
  if (parts.server === "lid") return `${parts.user}@lid`;
  return null;
}

/** A Baileys jid to send to, from the app's chat id (old "@c.us" links included). */
function toBaileysJid(chatId) {
  const parts = splitJid(chatId);
  if (!parts) return null;
  if (parts.server === "c.us" || parts.server === "s.whatsapp.net") return `${parts.user}@s.whatsapp.net`;
  if (parts.server === "lid") return `${parts.user}@lid`;
  return null;
}

/** Digits of a phone jid ("5511…@s.whatsapp.net" → "5511…"); null for @lid and anything else. */
function phoneOf(jid) {
  const parts = splitJid(jid);
  if (!parts || (parts.server !== "s.whatsapp.net" && parts.server !== "c.us")) return null;
  return /^[0-9]{8,20}$/.test(parts.user) ? parts.user : null;
}

/** Plain text of a message: a simple text, a text with a preview/reply, or a caption. */
function textOf(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ""
  );
}

/** True for media the bot cannot read yet (audio, image, sticker, document, video). */
function hasMedia(message) {
  if (!message) return false;
  return Boolean(message.audioMessage || message.imageMessage || message.stickerMessage || message.documentMessage || message.videoMessage);
}

module.exports = { splitJid, isPersonalChat, toAppChatId, toBaileysJid, phoneOf, textOf, hasMedia };
