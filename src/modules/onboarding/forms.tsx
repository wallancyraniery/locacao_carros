"use client";

import { useActionState, useState } from "react";
import { signup } from "@/modules/admin/auth_actions";
import { createOrganization } from "./actions";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, {});
  return <form action={action} className="lead-form">
    <div className="form-field"><label htmlFor="signup-email">E-mail</label><input id="signup-email" name="email" type="email" autoComplete="username" maxLength={254} required /></div>
    <div className="form-field"><label htmlFor="signup-password">Senha</label><input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby="signup-password-help" required /><p id="signup-password-help" className="field-help">Use pelo menos 12 caracteres.</p></div>
    <div className="form-field"><label htmlFor="signup-confirm">Confirmar senha</label><input id="signup-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></div>
    {state.message && <p role="status" aria-live="polite">{state.message}</p>}
    <button className="button primary" disabled={pending}>{pending ? "Criando conta…" : "Criar conta"}</button>
  </form>;
}

export function OrganizationForm({ operationId }: { operationId: string }) {
  const [state, action, pending] = useActionState(createOrganization.bind(null, operationId), {});
  const [values, setValues] = useState({ name: "", slug: "", city: "", dataController: "", privacyChannelLabel: "", privacyChannelUrl: "" });
  const field = (name: keyof typeof values) => ({ value: values[name], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [name]: event.target.value })) });
  return <form action={action} className="lead-form" aria-busy={pending}>
    <fieldset disabled={pending}><legend className="sr-only">Dados da sua locadora</legend>
      <div className="form-field"><label htmlFor="rental-name">Nome da locadora</label><input id="rental-name" name="name" {...field("name")} autoComplete="organization" minLength={2} maxLength={120} required /></div>
      <div className="form-field"><label htmlFor="rental-slug">Endereço público da locadora</label><input id="rental-slug" name="slug" {...field("slug")} minLength={3} maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-describedby="rental-slug-help" required /><p id="rental-slug-help" className="field-help">Escolha um nome único, como minha-locadora. Use letras minúsculas, números e hífens.</p></div>
      <div className="form-field"><label htmlFor="rental-city">Cidade</label><input id="rental-city" name="city" {...field("city")} autoComplete="address-level2" minLength={2} maxLength={100} required /></div>
      <div className="form-field"><label htmlFor="rental-controller">Responsável pelo tratamento dos dados</label><input id="rental-controller" name="dataController" {...field("dataController")} minLength={2} maxLength={160} aria-describedby="controller-help" required /><p id="controller-help" className="field-help">Nome da pessoa ou empresa que decide como os dados dos clientes são utilizados.</p></div>
      <div className="form-field"><label htmlFor="rental-channel-label">Nome do canal de privacidade</label><input id="rental-channel-label" name="privacyChannelLabel" {...field("privacyChannelLabel")} minLength={2} maxLength={80} placeholder="Ex.: Contato de privacidade" required /></div>
      <div className="form-field"><label htmlFor="rental-channel-url">Endereço do canal de privacidade</label><input id="rental-channel-url" name="privacyChannelUrl" {...field("privacyChannelUrl")} maxLength={500} placeholder="https://… ou mailto:…" aria-describedby="channel-help" required /><p id="channel-help" className="field-help">Informe uma página HTTPS ou um e-mail no formato mailto:privacidade@exemplo.com.</p></div>
      <button className="button primary" disabled={pending}>{pending ? "Criando sua locadora…" : "Criar minha locadora"}</button>
    </fieldset>
    {state.message && <p role="alert">{state.message}</p>}
  </form>;
}
