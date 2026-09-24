import { LogoutForm } from "@/modules/admin/auth_forms";
import { ImproveBrand } from "@/modules/ui/brand";
import { CentralNavigation } from "./navigation";

export function CentralShell({ title, current, name, email, role, children }: {
  title: string; current: string; name?: string; email?: string | null; role?: "owner" | "member"; children: React.ReactNode;
}) {
  return <div className="central-workspace">
    <a className="skip-link" href="#central-content">Pular para o conteúdo</a>
    <aside className="central-sidebar">
      <div className="central-brand"><ImproveBrand /><span>Central da locadora</span></div>
      <div className="central-tenant"><span className="caption">Sua locadora</span><strong>{name || "Área privada"}</strong></div>
      <CentralNavigation current={current} />
      <p className="sidebar-note">Um lugar para acompanhar sua operação.</p>
    </aside>
    <div className="central-main">
      <header className="central-topbar"><span className="caption">Área privada</span><div className="central-session"><div>{email && <span className="session-email" title={email}>{email}</span>}<span className="session-role">{role === "owner" ? "Conta proprietária" : role === "member" ? "Conta da equipe" : "Acesso à Central"}</span></div><LogoutForm /></div></header>
      <section id="central-content" className="central-content" tabIndex={-1}><header className="page-heading"><p className="eyebrow">Central da locadora</p><h1>{title}</h1></header>{children}</section>
    </div>
  </div>;
}
export function CentralError() { return <p className="central-access-error" role="alert">Não foi possível carregar sua locadora agora. Tente novamente em instantes.</p>; }
