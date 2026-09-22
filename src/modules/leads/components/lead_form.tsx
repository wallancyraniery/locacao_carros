"use client";

import { useActionState, type FormEvent } from "react";
import Link from "next/link";
import { submitLeadAction } from "../actions/submit_lead_action";
import { initialLeadFormState } from "./lead_form_state";
import { LeadFields } from "./lead_fields";
import { TurnstileField } from "./turnstile_field";

type TurnstileWidgetConfiguration = { mode: "local" } | { mode: "cloudflare"; siteKey: string };


export function LeadForm({ vehicleId, vehicleName, operationId, turnstileIdempotencyKey, turnstile }: {
  vehicleId: string;
  vehicleName: string;
  operationId: string;
  turnstileIdempotencyKey: string;
  turnstile: TurnstileWidgetConfiguration;
}) {
  const [state, action, pending] = useActionState(submitLeadAction, initialLeadFormState);
  const preventUnexpectedSubmit = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submitter instanceof HTMLButtonElement) || submitter.dataset.intent !== "submit-interest") event.preventDefault();
  };
  if (state.status === "success") return <div className="form-success" role="status"><h2>Recebemos seu interesse</h2><p>{state.message}</p><p>O envio não representa reserva, aprovação ou garantia de disponibilidade.</p>{state.whatsappUrl && <p><a className="button primary" href={state.whatsappUrl} target="_blank" rel="noopener noreferrer">Continuar pelo WhatsApp (opcional, abre em nova aba)</a><span> Você decide se deseja enviar a mensagem no WhatsApp.</span></p>}<Link className="button secondary" href="/#veiculos">Voltar aos veículos</Link></div>;
  return <form action={action} className="lead-form" noValidate onSubmit={preventUnexpectedSubmit}>
    <input type="hidden" name="vehicleId" value={vehicleId} />
    <input type="hidden" name="operationId" value={operationId} />
    <div className="form-field"><label htmlFor="selectedVehicle">Veículo selecionado</label><input id="selectedVehicle" value={vehicleName} readOnly /></div>
    <LeadFields state={state} />
    <TurnstileField configuration={turnstile} idempotencyKey={turnstileIdempotencyKey} resetId={state.turnstileResetId} />
    {state.message && <p className="form-message" role="alert">{state.message}</p>}
    <button className="button primary submit-button" type="submit" data-intent="submit-interest" disabled={pending}>{pending ? "Enviando..." : "Enviar interesse"}</button>
  </form>;
}
