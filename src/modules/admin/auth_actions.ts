"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "./supabase.server";

export type AuthState = { message?: string };
const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) });

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
  redirect("/admin/interessados");
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
