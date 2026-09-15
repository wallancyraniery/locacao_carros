import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseAdminAuthEnvironment } from "@/config/admin_auth_environment";

export async function createAdminClient() {
  const store = await cookies();
  const environment = parseAdminAuthEnvironment(process.env);
  return createServerClient(environment.url, environment.publishableKey, {
    cookieOptions: environment.cookieOptions,
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch {
          // Server Components cannot write cookies; the /admin proxy refreshes them.
        }
      },
    },
  });
}
