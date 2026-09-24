import { ImproveBrand } from "@/modules/ui/brand";
import { AuthFrame } from "@/modules/ui/auth_frame";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/modules/onboarding/forms";
import { loadOrganizationAccess } from "@/modules/onboarding/access.server";

export default async function SignupPage() {
  const access = await loadOrganizationAccess();
  if (access.status === "ready") redirect("/admin");
  if (access.status === "unassigned") redirect("/admin/onboarding");
  return <AuthFrame><section className="admin-login"><div className="auth-brand"><ImproveBrand /><span>Central da locadora</span></div><h1>Crie sua conta</h1><p>O primeiro passo para organizar sua locadora.</p>
    {access.status === "error" ? <p role="alert">Não foi possível verificar seu acesso agora. Tente novamente em instantes.</p> : <SignupForm />}
    <p>Já tem uma conta? <Link prefetch={false} href="/admin/login">Entrar</Link></p>
  </section></AuthFrame>;
}
