import "server-only";

import type { infer as Infer } from "zod";
import {
  requiredSupabaseValueSchema,
  supabaseProjectIdentitySchema,
  SupabaseEnvironmentError,
  validateProjectIdentity,
} from "./supabase_environment";

const serverEnvironmentSchema = supabaseProjectIdentitySchema.extend({
  SUPABASE_SECRET_KEY: requiredSupabaseValueSchema,
});

export type SupabaseServerEnvironment = Infer<typeof serverEnvironmentSchema>;

export function parseSupabaseServerEnvironment(environment: Record<string, string | undefined>): SupabaseServerEnvironment {
  const result = serverEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "desconhecido")))];
    throw new SupabaseEnvironmentError(`variáveis inválidas: ${fields.join(", ")}`);
  }

  validateProjectIdentity(result.data);
  return result.data;
}
