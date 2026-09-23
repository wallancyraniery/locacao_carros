import { LogoutForm } from "@/modules/admin/auth_forms";
import { CentralNavigation } from "./navigation";

export function CentralShell({ title, current, name, children }: {
  title: string; current: string; name?: string; children: React.ReactNode;
}) {
  return <><header className="admin-heading"><div>{name && <p>{name}</p>}<h1>{title}</h1></div><LogoutForm /></header>
    <CentralNavigation current={current} />{children}</>;
}
export function CentralError() { return <p role="alert">Não foi possível carregar sua locadora agora. Tente novamente em instantes.</p>; }
