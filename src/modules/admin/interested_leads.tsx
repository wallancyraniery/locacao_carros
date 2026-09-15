import type { InterestedLead } from "./interested_leads.server";

const statuses: Record<string, string> = {
  new: "Novo", contacted: "Contatado", under_review: "Em análise", approved: "Aprovado", rejected: "Recusado", converted: "Convertido",
};
export function InterestedLeads({ leads }: { leads: InterestedLead[] }) {
  if (!leads.length) return <p>Nenhum interessado recebido.</p>;
  return <div className="admin-table-scroll"><table className="admin-table">
    <caption>Interessados da sua organização</caption>
    <thead><tr>{["Recebido em", "Nome", "Contato", "Cidade", "Veículo", "Período preferido", "Status"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{leads.map((lead) => <tr key={lead.id}>
      <td><time dateTime={lead.created_at}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(lead.created_at))}</time></td>
      <td>{lead.full_name}</td><td>{lead.phone}{lead.email && <><br />{lead.email}</>}</td><td>{lead.city}</td>
      <td>{lead.vehicles ? [lead.vehicles.brand, lead.vehicles.model, lead.vehicles.version, lead.vehicles.year].filter(Boolean).join(" ") : "Não informado"}</td>
      <td>{lead.preferred_contact_time || "Não informado"}</td><td>{statuses[lead.status] ?? "Não informado"}</td>
    </tr>)}</tbody>
  </table></div>;
}
