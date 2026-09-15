export function parseAdminAuthEnvironment(environment: Record<string, string | undefined>) {
  const rawUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const key = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    const url = new URL(rawUrl ?? "");
    const local = environment.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!local && (url.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)))
      || (local && !["http:", "https:"].includes(url.protocol))
      || url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error();
    return { url: url.origin, publishableKey: key, cookieOptions: { httpOnly: true, sameSite: "lax" as const, secure: environment.NODE_ENV === "production", path: "/" } };
  } catch {
    throw new Error("Configuração da Central indisponível.");
  }
}
