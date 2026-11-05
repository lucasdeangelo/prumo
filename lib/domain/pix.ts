// Static Pix "copia e cola" (BR Code, EMV QRCPS-MPM) for settle-ups. The app never moves money:
// it only prepares the code the person pastes into their bank app.

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as required by the BR Code spec. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const char of payload) {
    crc ^= char.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function clean(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, max);
}

/** Normalizes a Pix key: phone to +55 E.164, CPF/CNPJ digits, e-mail lower case, random key as is. */
export function normalizePixKey(key: string): string {
  const value = key.trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return value.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value.toLowerCase();
  const digits = value.replace(/\D/g, "");
  if (value.startsWith("+")) return `+${digits}`;
  if (digits.length === 11 && /^\d{2}9/.test(digits) && !value.includes(".")) return `+55${digits}`;
  return digits;
}

export function buildPixPayload(input: { key: string; amountCents: number; name: string; city?: string; description?: string; txid?: string }): string {
  const account = field("00", "br.gov.bcb.pix") + field("01", normalizePixKey(input.key)) + (input.description ? field("02", clean(input.description, 40)) : "");
  const body =
    field("00", "01") +
    field("26", account) +
    field("52", "0000") +
    field("53", "986") +
    field("54", (input.amountCents / 100).toFixed(2)) +
    field("58", "BR") +
    field("59", clean(input.name, 25) || "PRUMO") +
    field("60", clean(input.city ?? "SAO PAULO", 15) || "SAO PAULO") +
    field("62", field("05", clean(input.txid ?? "PRUMO", 25).replace(/[^A-Z0-9]/g, "") || "***")) +
    "6304";
  return body + crc16(body);
}

/** "celular •••• 4321" style label for showing a key without exposing it whole. */
export function maskPixKey(key: string): string {
  const value = normalizePixKey(key);
  const kind = value.startsWith("+") ? "celular" : value.includes("@") ? "e-mail" : value.length === 11 ? "CPF" : value.length === 14 ? "CNPJ" : "chave";
  return `${kind} •••• ${value.replace(/\D/g, "").slice(-4) || value.slice(-4)}`;
}
