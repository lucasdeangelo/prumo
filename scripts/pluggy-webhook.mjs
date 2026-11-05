// Registers (or updates) the Pluggy webhook with the secret header the app verifies.
// Usage: node --env-file=.env.local scripts/pluggy-webhook.mjs https://your-app.example.com
const appUrl = (process.argv[2] || process.env.APP_URL || "").replace(/\/$/, "");
const { PLUGGY_CLIENT_ID: clientId, PLUGGY_CLIENT_SECRET: clientSecret, PLUGGY_WEBHOOK_SECRET: secret } = process.env;

if (!appUrl.startsWith("https://")) throw new Error("Pluggy exige uma URL pública HTTPS (porta 443). Ex.: https://seu-app.vercel.app");
if (!clientId || !clientSecret || !secret) throw new Error("Defina PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_WEBHOOK_SECRET.");

const base = "https://api.pluggy.ai";
const auth = await fetch(`${base}/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
if (!auth.ok) throw new Error(`Falha na autenticação Pluggy: ${auth.status}`);
const { apiKey } = await auth.json();
const headers = { "Content-Type": "application/json", "X-API-KEY": apiKey };

const url = `${appUrl}/api/webhooks/pluggy`;
const body = JSON.stringify({ url, event: "all", headers: { "x-prumo-webhook-secret": secret } });
const list = await (await fetch(`${base}/webhooks`, { headers })).json();
const existing = (list.results ?? list ?? []).find?.((w) => w.url === url);
const response = existing
  ? await fetch(`${base}/webhooks/${existing.id}`, { method: "PATCH", headers, body })
  : await fetch(`${base}/webhooks`, { method: "POST", headers, body });
if (!response.ok) throw new Error(`Pluggy recusou o webhook: ${response.status} ${await response.text()}`);
console.log(`${existing ? "Atualizado" : "Registrado"}: ${url}`);
