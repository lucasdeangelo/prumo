const assert = require("node:assert/strict");
const { test } = require("node:test");

const { parseJson } = require("../lib/ai");
const { createConversation } = require("../lib/conversation");

function fakeApi(responses) {
  const calls = [];
  return {
    calls,
    message: async (phone, text, aiOutput) => {
      calls.push({ op: "message", text, aiOutput });
      return responses.message(text, aiOutput);
    },
    execute: async (phone, messageId, action) => {
      calls.push({ op: "execute", messageId, action });
      return { kind: "reply", text: "✅ Salvo!" };
    },
  };
}

const proposal = { kind: "confirm", text: "Confirmar?", action: { kind: "transaction", draft: { amountCents: 4590 } } };

test("asks for confirmation, then executes once with the proposal message id", async () => {
  const api = fakeApi({ message: () => proposal });
  const conv = createConversation({ api, ai: null });
  assert.equal(await conv.handle({ chatId: "c", phone: "5511", text: "gastei 45,90 mercado", messageId: "m1" }), "Confirmar?");
  assert.equal(await conv.handle({ chatId: "c", phone: "5511", text: "Sim", messageId: "m2" }), "✅ Salvo!");
  assert.equal(api.calls.filter((c) => c.op === "execute").length, 1);
  assert.equal(api.calls.find((c) => c.op === "execute").messageId, "m1");
  // A second "sim" has nothing pending and goes to the app as a normal message.
  await conv.handle({ chatId: "c", phone: "5511", text: "sim", messageId: "m3" });
  assert.equal(api.calls.filter((c) => c.op === "execute").length, 1);
});

test("cancels with nao and never executes", async () => {
  const api = fakeApi({ message: () => proposal });
  const conv = createConversation({ api, ai: null });
  await conv.handle({ chatId: "c", phone: "5511", text: "gastei 10 cafe", messageId: "m1" });
  assert.match(await conv.handle({ chatId: "c", phone: "5511", text: "não", messageId: "m2" }), /Cancelado/);
  assert.equal(api.calls.some((c) => c.op === "execute"), false);
});

test("falls back to the local model only when the app asks for it", async () => {
  const api = fakeApi({ message: (text, aiOutput) => (aiOutput ? proposal : { kind: "needs_ai", systemPrompt: "x" }) });
  const ai = { extract: async () => ({ tipo: "saida", valor: 62, descricao: "almoço" }) };
  const conv = createConversation({ api, ai, today: () => "2026-11-04" });
  assert.equal(await conv.handle({ chatId: "c", phone: "5511", text: "almoço deu 62", messageId: "m1" }), "Confirmar?");
  assert.deepEqual(api.calls[1].aiOutput, { tipo: "saida", valor: 62, descricao: "almoço" });
});

test("explains when the model is unavailable", async () => {
  const api = fakeApi({ message: () => ({ kind: "needs_ai", systemPrompt: "x" }) });
  const conv = createConversation({ api, ai: { extract: async () => null } });
  assert.match(await conv.handle({ chatId: "c", phone: "5511", text: "62 conto", messageId: "m1" }), /Não consegui/);
});

test("extracts JSON from noisy model output", () => {
  assert.deepEqual(parseJson('```json\n{"tipo":"saida"}\n```'), { tipo: "saida" });
  assert.deepEqual(parseJson('Claro! {"valor": 10} espero ter ajudado'), { valor: 10 });
  assert.equal(parseJson("sem json"), null);
});
