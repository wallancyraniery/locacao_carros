import "server-only";

export function signupConfirmationUrl(environment: Record<string, string | undefined> = process.env): string {
  try {
    const raw = environment.APP_PUBLIC_ORIGIN;
    const url = new URL(raw ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const localHttp = environment.NODE_ENV !== "production" && loopback && url.protocol === "http:";
    // Accept only an explicit origin, never paths, credentials or request headers.
    if ((url.protocol !== "https:" && !localHttp)
      || (environment.NODE_ENV === "production" && loopback)
      || (raw !== url.origin && raw !== `${url.origin}/`)) throw new Error();
    return `${url.origin}/admin/confirmar`;
  } catch {
    throw new Error("Configuração de confirmação indisponível.");
  }
}
