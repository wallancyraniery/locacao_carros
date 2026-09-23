import Link from "next/link";

const items = [["Visão geral", "/admin"], ["Veículos", "/admin/veiculos"], ["Reservas", "/admin/reservas"],
  ["Interessados", "/admin/interessados"], ["Minha locadora", "/admin/locadora"]] as const;
export function CentralNavigation({ current }: { current: string }) {
  return <nav aria-label="Central da locadora" className="central-nav">{items.map(([label, href]) =>
    <Link key={href} href={href} prefetch={false} aria-current={current === href ? "page" : undefined}>{label}</Link>)}</nav>;
}
