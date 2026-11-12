import "server-only";

import { NextResponse } from "next/server";

/**
 * Next signals redirect() and notFound() by throwing errors with a digest. The mobile API turns
 * them into JSON the app understands: { redirect: "/path" } or a 404 / 401.
 */
export type Outcome<T> = { kind: "ok"; value: T } | { kind: "redirect"; to: string } | { kind: "notFound" };

export async function capture<T>(run: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { kind: "ok", value: await run() };
  } catch (error) {
    const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest: unknown }).digest) : "";
    if (digest.startsWith("NEXT_REDIRECT")) return { kind: "redirect", to: digest.split(";")[2] ?? "/overview" };
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404") || digest === "NEXT_NOT_FOUND") return { kind: "notFound" };
    throw error;
  }
}

const noStore = { "Cache-Control": "private, no-store" };

export function respond<T>(outcome: Outcome<T>, wrap: (value: T) => unknown = (value) => value) {
  if (outcome.kind === "notFound") return NextResponse.json({ error: "Não encontrado" }, { status: 404, headers: noStore });
  if (outcome.kind === "redirect") {
    // requireUser() sends anonymous people to /login: for the app that means the token expired.
    if (outcome.to.startsWith("/login")) return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: noStore });
    return NextResponse.json({ redirect: outcome.to }, { headers: noStore });
  }
  return NextResponse.json(wrap(outcome.value) ?? null, { headers: noStore });
}

export function failure(error: unknown) {
  console.error("mobile api failed", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Algo deu errado. Tente novamente." }, { status: 500, headers: noStore });
}

/** JSON fields from the app become the FormData the server actions already parse. */
export function toFormData(fields: unknown): FormData {
  const form = new FormData();
  if (!fields || typeof fields !== "object") return form;
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === null || v === undefined || v === false) continue;
      form.append(key, v === true ? "on" : String(v));
    }
  }
  return form;
}
