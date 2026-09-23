import Link from "next/link";
import { redirect } from "next/navigation";
import { loadOrganizationAccess } from "@/modules/onboarding/access.server";
import { LogoutForm } from "@/modules/admin/auth_forms";

export default async function ReadyPage() {
  const access = await loadOrganizationAccess();
  if (access.status === "anonymous") redirect("/admin/login");
  if (access.status === "unassigned") redirect("/admin/onboarding");
  return <section className="admin-login"><LogoutForm />{access.status === "error"
    ? <p role="alert">Não foi possível verificar seu acesso agora. Tente novamente em instantes.</p>
    : <><h1>Sua locadora está pronta</h1><p>Você já pode acessar sua área privada.</p><Link className="button primary" prefetch={false} href="/admin">Entrar na minha locadora</Link></>}
  </section>;
}
