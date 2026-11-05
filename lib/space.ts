import "server-only";

import { cookies } from "next/headers";

export type Space = "meu" | "nosso";
export const SPACE_COOKIE = "prumo_space";

/** The space the person used last ("Início abre o último espaço usado"). Defaults to Meu. */
export async function currentSpace(): Promise<Space> {
  const value = (await cookies()).get(SPACE_COOKIE)?.value;
  return value === "nosso" ? "nosso" : "meu";
}
