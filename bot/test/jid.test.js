const assert = require("node:assert/strict");
const { test } = require("node:test");

const { hasMedia, isPersonalChat, phoneOf, textOf, toAppChatId, toBaileysJid } = require("../lib/jid");

test("chat ids go to the app in the format links already use", () => {
  assert.equal(toAppChatId("5511999990000@s.whatsapp.net"), "5511999990000@c.us");
  assert.equal(toAppChatId("5511999990000:12@s.whatsapp.net"), "5511999990000@c.us");
  assert.equal(toAppChatId("123456789012345@lid"), "123456789012345@lid");
  assert.equal(toAppChatId("120363000000000000@g.us"), null);
  assert.equal(toAppChatId("status@broadcast"), null);
});

test("links saved before Baileys still get messages", () => {
  assert.equal(toBaileysJid("5511999990000@c.us"), "5511999990000@s.whatsapp.net");
  assert.equal(toBaileysJid("123456789012345@lid"), "123456789012345@lid");
  assert.equal(toBaileysJid("nada"), null);
});

test("only one-to-one chats are answered", () => {
  assert.equal(isPersonalChat("5511999990000@s.whatsapp.net"), true);
  assert.equal(isPersonalChat("123456789012345@lid"), true);
  assert.equal(isPersonalChat("120363000000000000@g.us"), false);
  assert.equal(isPersonalChat("status@broadcast"), false);
  assert.equal(isPersonalChat("120363000000000000@newsletter"), false);
});

test("the phone comes from a phone jid, never from a @lid", () => {
  assert.equal(phoneOf("5511999990000@s.whatsapp.net"), "5511999990000");
  assert.equal(phoneOf("5511999990000:3@s.whatsapp.net"), "5511999990000");
  assert.equal(phoneOf("123456789012345@lid"), null);
  assert.equal(phoneOf(undefined), null);
});

test("text and media are read from the message content", () => {
  assert.equal(textOf({ conversation: "saldo" }), "saldo");
  assert.equal(textOf({ extendedTextMessage: { text: "gastei 10" } }), "gastei 10");
  assert.equal(textOf({ imageMessage: { caption: "nota" } }), "nota");
  assert.equal(textOf(undefined), "");
  assert.equal(hasMedia({ audioMessage: {} }), true);
  assert.equal(hasMedia({ conversation: "oi" }), false);
});
