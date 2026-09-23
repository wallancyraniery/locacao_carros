"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "./supabase.server";
import { signupSchema } from "@/modules/onboarding/validation";

export type AuthState = { message?: string };
const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) });

export async function signup(_state: AuthState, form: FormData): Promise<AuthState> {
  const input = signupSchema.safeParse({ email: form.get("email"), password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!input.success) return { message: "Informe um e-mail válido e uma senha de 12 a 128 caracteres. As senhas devem ser iguais." };
  let authenticated = false;
  try {
    const client = await createAdminClient();
    const { data, error } = await client.auth.signUp({ email: input.data.email, password: input.data.password });
    // Confirmation settings belong to Auth. A user object alone is not a session.
    authenticated = !error && !!data.session;
  } catch {
    // Use the same public answer for existing accounts and provider failures.
  }
  if (authenticated) {
    revalidatePath("/admin", "layout");
    redirect("/admin");
  }
  return { message: "Se o cadastro puder ser concluído, você receberá as instruções no seu e-mail. Confira também o spam. Se já possui conta, entre com suas credenciais." };
}

export async function login(_state: AuthState, form: FormData): Promise<AuthState> {
  const input = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) return { message: "Não foi possível entrar. Confira suas credenciais e tente novamente." };
  try {
    const client = await createAdminClient();
    const { error } = await client.auth.signInWithPassword(input.data);
    if (error) return { message: "Não foi possível entrar. Confira suas credenciais e tente novamente." };
  } catch {
    return { message: "Não foi possível entrar agora. Tente novamente mais tarde." };
  }
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function logout(): Promise<AuthState> {
  try {
    const client = await createAdminClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return { message: "Não foi possível sair. Tente novamente." };
  } catch {
    return { message: "Não foi possível sair. Tente novamente." };
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}
