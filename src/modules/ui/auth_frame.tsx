import type { ReactNode } from "react";
import Link from "next/link";
import { ImproveBrand } from "./brand";
import { FlowBackdrop } from "./flow_backdrop";

export function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="auth-scene">
    <FlowBackdrop />
    <div className="auth-context">
      <Link className="auth-home" href="/" aria-label="Improve — Início"><ImproveBrand /></Link>
      <p className="eyebrow">Central da locadora</p>
      <h2>Seu espaço para<br />organizar a frota.</h2>
      <p>Cadastre seus veículos, publique sua vitrine e reúna as informações da sua locadora.</p>
      <span className="auth-context-detail">Frota organizada. Locadora em primeiro plano.</span>
    </div>
    <div className="auth-card-area">{children}</div>
  </div>;
}
