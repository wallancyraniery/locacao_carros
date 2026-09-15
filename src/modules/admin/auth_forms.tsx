"use client";

import { useActionState } from "react";
import { login, logout } from "./auth_actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return <form action={action} className="lead-form">
    <div className="form-field"><label htmlFor="admin-email">E-mail</label>
    <input id="admin-email" name="email" type="email" autoComplete="username" required maxLength={254} /></div>
    <div className="form-field"><label htmlFor="admin-password">Senha</label>
    <input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} /></div>
    {state.message && <p role="alert">{state.message}</p>}
    <button className="button primary" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
  </form>;
}

export function LogoutForm() {
  const [state, action, pending] = useActionState(logout, {});
  return <form action={action}>
    <button className="button secondary" disabled={pending}>{pending ? "Saindo…" : "Sair"}</button>
    {state.message && <p role="alert">{state.message}</p>}
  </form>;
}
