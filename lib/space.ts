import "server-only";

import { cookies, headers } from "next/headers";

export type Space = "meu" | "nosso";
export const SPACE_COOKIE = "prumo_space";
export const SPACE_HEADER = "x-prumo-space";

/** The space the person used last ("Início abre o último espaço usado"). Defaults to Meu. */
export async function currentSpace(): Promise<Space> {
  // The mobile app keeps the space on the device and sends it with each request.
  const value = (await headers()).get(SPACE_HEADER) ?? (await cookies()).get(SPACE_COOKIE)?.value;
  return value === "nosso" ? "nosso" : "meu";
}
