import "server-only";

// Banco Central "SGS" open data: https://dadosabertos.bcb.gov.br (no key, public series).
// Contract checked on 2026-11-16: GET /dados/serie/bcdata.sgs.{code}/dados?formato=json
// &dataInicial=dd/mm/aaaa&dataFinal=dd/mm/aaaa → [{ "data": "13/11/2026", "valor": "0.050788" }].
const BASE_URL = "https://api.bcb.gov.br/dados/serie";
const TIMEOUT_MS = 15_000;

export const SERIES = { cdi: 12, selic: 11, ipca: 433, ipca12: 13522 } as const;
export type SeriesName = keyof typeof SERIES;

const toBr = (iso: string) => iso.split("-").reverse().join("/");
const toIso = (br: string) => br.split("/").reverse().join("-");

/** Values of one series between two dates (inclusive). Daily series accept at most 10 years per call. */
export async function fetchSeries(series: SeriesName, from: string, to: string): Promise<Array<{ date: string; value: number }>> {
  const url = `${BASE_URL}/bcdata.sgs.${SERIES[series]}/dados?formato=json&dataInicial=${toBr(from)}&dataFinal=${toBr(to)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store", headers: { Accept: "application/json" } });
  // No value in the range answers 404 with a message instead of an empty list.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Banco Central respondeu ${response.status}`);
  const rows = (await response.json()) as Array<{ data: string; valor: string }>;
  return rows
    .filter((r) => /^\d{2}\/\d{2}\/\d{4}$/.test(r.data) && r.valor !== "" && Number.isFinite(Number(r.valor)))
    .map((r) => ({ date: toIso(r.data), value: Number(r.valor) }));
}
