"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/modules/admin/supabase.server";
import { organizationInputSchema } from "./validation";

export type OnboardingState = { message?: string };
export async function createOrganization(operationId: string, _state: OnboardingState, form: FormData): Promise<OnboardingState> {
  // Enumerate inputs: identity and owner role are never accepted from the form.
  const input = organizationInputSchema.safeParse({ operationId, name: form.get("name"), slug: form.get("slug"),
    city: form.get("city"), dataController: form.get("dataController"),
    privacyChannelLabel: form.get("privacyChannelLabel"), privacyChannelUrl: form.get("privacyChannelUrl") });
  if (!input.success) return { message: "Revise os campos. Use um endereço com letras minúsculas, números e hífens e um canal HTTPS ou mailto válido." };
  try {
    const client = await createAdminClient();
    const { data: identity, error: identityError } = await client.auth.getUser();
    if (identityError || !identity.user || identity.user.is_anonymous) return { message: "Entre na sua conta para criar sua locadora." };
    const data = input.data;
    const result = await client.rpc("create_initial_organization", {
      p_operation_id: data.operationId, p_name: data.name, p_slug: data.slug, p_city: data.city,
      p_data_controller: data.dataController, p_privacy_channel_label: data.privacyChannelLabel,
      p_privacy_channel_url: data.privacyChannelUrl,
    });
    if (result.error?.code === "P2002") return { message: "Esse endereço não está disponível. Escolha outro." };
    if (result.error?.code === "P2003") return { message: "Sua conta já possui uma locadora ou este cadastro já foi concluído. Acesse sua área privada." };
    if (result.error || !z.uuid().safeParse(result.data).success) return { message: "Não foi possível criar sua locadora agora. Tente novamente neste formulário." };
  } catch {
    return { message: "Não foi possível criar sua locadora agora. Tente novamente neste formulário." };
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/pronto");
}
