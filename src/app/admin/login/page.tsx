import { LoginForm } from "@/modules/admin/auth_forms";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadOrganizationAccess } from "@/modules/onboarding/access.server";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ confirmation?: string }> }) {
  const access = await loadOrganizationAccess();
  if (access.status === "ready" || access.status === "unassigned") redirect("/admin");
  const params = await searchParams;
  return <section className="admin-login"><h1>Entre na sua locadora</h1><p>Acesse sua área privada com e-mail e senha.</p>
    {params?.confirmation === "failed" && <p role="alert">Não foi possível confirmar esse link. Confira o e-mail mais recente ou tente entrar na sua conta.</p>}
    <LoginForm /><p>Ainda não tem conta? <Link prefetch={false} href="/admin/cadastro">Criar conta</Link></p>
  </section>;
}
