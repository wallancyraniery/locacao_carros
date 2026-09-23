import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { loadOrganizationAccess } from "@/modules/onboarding/access.server";
import { OrganizationForm } from "@/modules/onboarding/forms";
import { LogoutForm } from "@/modules/admin/auth_forms";

export default async function OnboardingPage() {
  const access = await loadOrganizationAccess();
  if (access.status === "anonymous") redirect("/admin/login");
  if (access.status === "ready") redirect("/admin");
  return <section className="admin-login"><header className="admin-heading"><h1>Crie sua locadora</h1><LogoutForm /></header>
    {access.status === "error" ? <p role="alert">Não foi possível verificar seu acesso agora. Tente novamente em instantes.</p> : <><p>Informe os dados da sua empresa e o contato para questões de privacidade.</p><OrganizationForm operationId={randomUUID()} /></>}
  </section>;
}
