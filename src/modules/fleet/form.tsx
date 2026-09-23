"use client";
import { useActionState, useState } from "react";
import { createVehicle } from "./actions";

export function VehicleForm({ operationId }: { operationId: string }) {
  const [state, action, pending] = useActionState(createVehicle.bind(null, operationId), {});
  const [values, setValues] = useState({ brand: "", model: "", version: "", year: "", color: "", weeklyPrice: "", operationalStatus: "active" });
  const field = (name: keyof typeof values) => ({ name, value: values[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((current) => ({ ...current, [name]: event.target.value })) });
  return <form action={action} className="lead-form" aria-busy={pending}>
    <fieldset disabled={pending}><legend>Dados do veículo</legend>
      <div className="form-field"><label htmlFor="fleet-brand">Marca</label><input id="fleet-brand" {...field("brand")} maxLength={80} required /></div>
      <div className="form-field"><label htmlFor="fleet-model">Modelo</label><input id="fleet-model" {...field("model")} maxLength={120} required /></div>
      <div className="form-field"><label htmlFor="fleet-version">Versão (opcional)</label><input id="fleet-version" {...field("version")} maxLength={120} /></div>
      <div className="form-field"><label htmlFor="fleet-year">Ano</label><input id="fleet-year" {...field("year")} type="number" min={1900} max={2200} step={1} required /></div>
      <div className="form-field"><label htmlFor="fleet-color">Cor</label><input id="fleet-color" {...field("color")} maxLength={60} required /></div>
      <div className="form-field"><label htmlFor="fleet-price">Valor semanal (R$)</label><input id="fleet-price" {...field("weeklyPrice")} inputMode="decimal" maxLength={11} placeholder="700,00" required /></div>
      <div className="form-field"><label htmlFor="fleet-state">Estado operacional</label><select id="fleet-state" {...field("operationalStatus")}><option value="active">Ativo</option><option value="inactive">Inativo</option></select><p className="field-help">Ativo não significa disponível em todas as datas. Reservas e bloqueios definem a disponibilidade por período.</p></div>
      <p>Veículos cadastrados aqui como ativos aparecem na vitrine quando ela estiver publicada. O cadastro ainda não inclui fotos.</p>
      <button className="button primary" disabled={pending}>{pending ? "Cadastrando…" : "Cadastrar veículo"}</button>
    </fieldset>{state.message && <p role="alert">{state.message}</p>}
  </form>;
}
