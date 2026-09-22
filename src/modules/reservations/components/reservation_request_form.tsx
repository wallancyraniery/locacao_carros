"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { LeadFields } from "@/modules/leads/components/lead_fields";
import { TurnstileField } from "@/modules/leads/components/turnstile_field";
import type { ReservationFormAction, ReservationFormState } from "./reservation_form_state";

const initialState: ReservationFormState = { status: "idle" };
export function ReservationRequestForm({ action: submitAction, changeDatesHref, turnstileIdempotencyKey, turnstile }: {
  action: ReservationFormAction;
  changeDatesHref: string;
  turnstileIdempotencyKey: string;
  turnstile: { mode: "local" } | { mode: "cloudflare"; siteKey: string };
}) {
  const [state, action, pending] = useActionState(submitAction, initialState);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.status !== "idle") feedback.current?.focus(); }, [state]);
  if (state.status === "success") return <div className="form-success reservation-success" role="status" tabIndex={-1} ref={feedback}>
    <p className="eyebrow">Próximo passo: análise da locadora</p>
    <h2>Solicitação recebida</h2>
    <p>{state.message}</p>
    <p>Você não precisa enviar novamente. Aguarde o contato da locadora.</p>
    <Link href="/#veiculos" className="button secondary">Voltar aos veículos</Link>
  </div>;
  const stopped = state.status === "unavailable" || state.status === "conflict";
  return <form action={action} className="lead-form reservation-form" noValidate aria-busy={pending}>
    <h2>Seus dados para análise</h2>
    <p className="field-help">Preencha os dados abaixo. Não envie documentos nesta etapa.</p>
    {state.message && <div className="form-message" role="alert" tabIndex={-1} ref={feedback}>
      <p>{state.message}</p>
      {state.status === "unavailable" && <Link className="button secondary" href={changeDatesHref}>Escolher novas datas</Link>}
    </div>}
    <fieldset disabled={pending || stopped} className="reservation-fields">
      <legend className="sr-only">Dados e declarações</legend>
      <LeadFields state={state} acknowledgementText="Estou ciente de que esta solicitação será analisada pela locadora. O envio não é aprovação e o período não está confirmado até aprovação." />
      <TurnstileField configuration={turnstile} idempotencyKey={turnstileIdempotencyKey} resetId={state.turnstileResetId} />
      <button className="button primary submit-button" type="submit">{pending ? "Enviando solicitação..." : "Solicitar reserva"}</button>
    </fieldset>
    <p className="field-help" role="status">{pending ? "Aguarde enquanto enviamos sua solicitação." : "A solicitação será enviada somente ao selecionar Solicitar reserva."}</p>
  </form>;
}
