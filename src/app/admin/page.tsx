import { redirect } from "next/navigation";
import { loadOrganizationAccess } from "@/modules/onboarding/access.server";

export default async function AdminPage() {
  const access = await loadOrganizationAccess();
  if (access.status === "anonymous") redirect("/admin/login");
  if (access.status === "unassigned") redirect("/admin/onboarding");
  if (access.status === "ready") redirect("/admin/interessados");
  return <p role="alert">Não foi possível verificar seu acesso agora. Tente novamente em instantes.</p>;
}
