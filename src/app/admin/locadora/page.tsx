import { requireCentralContext } from "@/modules/central/access.server";
import { CentralShell, CentralError } from "@/modules/central/shell";

export default async function OrganizationPage() {
  const context = await requireCentralContext();
  if (context.status !== "ready") return <CentralError />;
  const org = context.organization;
  return <CentralShell title="Minha locadora" current="/admin/locadora" name={org.name}>
    <p>Dados informados no cadastro. A edição ainda não está disponível.</p>
    <dl className="central-details">{[["Nome", org.name], ["Identificador público reservado", org.slug], ["Cidade", org.city],
      ["Responsável pelo tratamento dos dados", org.data_controller], ["Canal de privacidade", org.privacy_channel_label],
      ["Endereço do canal de privacidade", org.privacy_channel_url]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Não informado"}</dd></div>)}</dl>
    <p>Seu identificador está reservado. A página pública da locadora ainda não foi disponibilizada.</p>
  </CentralShell>;
}
