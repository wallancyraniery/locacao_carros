import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/modules/admin/supabase.server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const code = request.nextUrl.searchParams.get("code");
  let verified = false;
  try {
    const client = await createAdminClient();
    const result = tokenHash && tokenHash.length <= 1024 && request.nextUrl.searchParams.get("type") === "signup"
      ? await client.auth.verifyOtp({ token_hash: tokenHash, type: "signup" })
      : code && code.length <= 1024 ? await client.auth.exchangeCodeForSession(code) : null;
    verified = !!result && !result.error && !!result.data.session;
  } catch {
    // Never log the confirmation URL, token or provider response.
  }
  const response = NextResponse.redirect(new URL(verified ? "/admin" : "/admin/login?confirmation=failed", request.url));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
