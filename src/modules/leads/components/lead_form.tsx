"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitLeadAction } from "../actions/submit_lead_action";
import { initialLeadFormState } from "./lead_form_state";

const ErrorMessage = ({ errors, field }: { errors?: Record<string, string[]>; field: string }) => errors?.[field]?.[0] ? <p className="field-error" id={`${field}-error`}>{errors[field][0]}</p> : null;

export function LeadForm({ vehicleId, vehicleName }: { vehicleId: string; vehicleName: string }) {
  const [state, action, pending] = useActionState(submitLeadAction, initialLeadFormState);
  const described = (field: string) => state.errors?.[field] ? `${field}-error` : undefined;
  if (state.status === "success") return <div className="form-success" role="status"><h2>Recebemos seu interesse</h2><p>{state.message}</p><p>O envio não representa reserva, aprovação ou garantia de disponibilidade.</p><Link className="button secondary" href="/#veiculos">Voltar aos veículos</Link></div>;
  return <form action={action} className="lead-form" noValidate>
    <input type="hidden" name="vehicleId" value={vehicleId} />
    <div className="form-field"><label htmlFor="selectedVehicle">Veículo selecionado</label><input id="selectedVehicle" value={vehicleName} readOnly /></div>
    <div className="form-field"><label htmlFor="fullName">Nome completo</label><input id="fullName" name="fullName" autoComplete="name" defaultValue={state.values?.fullName} aria-invalid={!!state.errors?.fullName} aria-describedby={described("fullName")} /><ErrorMessage errors={state.errors} field="fullName" /></div>
    <div className="form-grid"><div className="form-field"><label htmlFor="phone">Telefone</label><input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="(12) 99999-9999" defaultValue={state.values?.phone} aria-invalid={!!state.errors?.phone} aria-describedby={described("phone")} /><ErrorMessage errors={state.errors} field="phone" /></div><div className="form-field"><label htmlFor="email">E-mail <span>(opcional)</span></label><input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} aria-invalid={!!state.errors?.email} aria-describedby={described("email")} /><ErrorMessage errors={state.errors} field="email" /></div></div>
    <div className="form-field"><label htmlFor="city">Cidade</label><input id="city" name="city" autoComplete="address-level2" defaultValue={state.values?.city ?? "São José dos Campos"} aria-invalid={!!state.errors?.city} aria-describedby={described("city")} /><ErrorMessage errors={state.errors} field="city" /></div>
    <fieldset><legend>Possui CNH definitiva?</legend><label className="radio-label"><input type="radio" name="hasDefinitiveLicense" value="yes" defaultChecked={state.values?.hasDefinitiveLicense === "yes"} /> Sim</label><label className="radio-label"><input type="radio" name="hasDefinitiveLicense" value="no" defaultChecked={state.values?.hasDefinitiveLicense === "no"} /> Não</label><ErrorMessage errors={state.errors} field="hasDefinitiveLicense" /></fieldset>
    <div className="form-grid"><div className="form-field"><label htmlFor="driverPlatform">Aplicativo <span>(opcional)</span></label><input id="driverPlatform" name="driverPlatform" defaultValue={state.values?.driverPlatform} maxLength={80} /></div><div className="form-field"><label htmlFor="preferredContactTime">Melhor período para contato <span>(opcional)</span></label><select id="preferredContactTime" name="preferredContactTime" defaultValue={state.values?.preferredContactTime ?? ""}><option value="">Sem preferência</option><option>Manhã</option><option>Tarde</option><option>Noite</option></select></div></div>
    <div className="honeypot" aria-hidden="true"><label htmlFor="website">Não preencha este campo</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
    <label className="acknowledgement"><input type="checkbox" name="acknowledgement" value="accepted" defaultChecked={state.values?.acknowledgement === "accepted"} /> <span>Estou ciente de que o envio não garante reserva, aprovação ou disponibilidade.</span></label><ErrorMessage errors={state.errors} field="acknowledgement" />
    <p className="privacy-note">Seus dados serão utilizados somente para analisar seu interesse na locação e realizar contato.</p>
    {state.message && <p className="form-message" role="alert">{state.message}</p>}
    <button className="button primary submit-button" type="submit" disabled={pending}>{pending ? "Enviando..." : "Enviar interesse"}</button>
  </form>;
}
