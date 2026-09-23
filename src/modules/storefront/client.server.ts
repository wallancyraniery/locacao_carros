import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseAdminAuthEnvironment } from "@/config/admin_auth_environment";

// A fresh anonymous client: never forward an authenticated visitor's cookies/JWT.
export function createStorefrontClient() {
  const environment = parseAdminAuthEnvironment(process.env);
  return createClient(environment.url, environment.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
