/**
 * Accepts only same-site relative paths for redirects ("/cards?m=1"). Rejects absolute URLs,
 * protocol-relative "//host" and the "/\host" form browsers also treat as another site.
 */
export function safeRelativePath(value: unknown, fallback: string): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  // Control characters and any backslash: browsers normalize "\" to "/" in URLs.
  if (/[\u0000-\u001f\\]/.test(path)) return fallback;
  return path;
}
