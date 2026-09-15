import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseAdminAuthEnvironment } from "@/config/admin_auth_environment";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  try {
    const environment = parseAdminAuthEnvironment(process.env);
    const client = createServerClient(environment.url, environment.publishableKey, {
      cookieOptions: environment.cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, headers) {
          for (const { name, value } of values) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of values) response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        },
      },
    });
    await client.auth.getClaims();
  } catch {
    // Pages and actions validate identity independently and fail closed without logging tokens.
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = { matcher: ["/admin/:path*"] };
