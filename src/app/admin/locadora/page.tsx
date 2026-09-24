import { PublicationForm } from "@/modules/storefront/publication_form";
import { storefrontSlug } from "@/modules/storefront/contracts";
import { requireCentralContext } from "@/modules/central/access.server";
import { CentralShell, CentralError } from "@/modules/central/shell";

export default async function OrganizationPage() {
  const context = await requireCentralContext();
  if (context.status !== "ready") return <CentralError />;
  const org = context.organization;
  return <CentralShell title="Minha locadora" current="/admin/locadora" name={org.name} email={context.email} role={context.role}>
    <p>Dados informados no cadastro. A edição ainda não está disponível.</p>
    <dl className="central-details ui-panel">{[["Nome", org.name], ["Identificador público reservado", org.slug], ["Cidade", org.city],
      ["Responsável pelo tratamento dos dados", org.data_controller], ["Canal de privacidade", org.privacy_channel_label],
      ["Endereço do canal de privacidade", org.privacy_channel_url]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Não informado"}</dd></div>)}</dl>
    <section className="ui-panel publication-panel"><div className="panel-heading"><h2>Vitrine pública</h2>
    <p className={`status-badge ${org.storefront_status === "published" ? "is-positive" : ""}`}>{org.storefront_status === "published" ? "Publicada" : "Não publicada"}</p></div>
    <p>Ao publicar, o nome, a cidade e os veículos elegíveis da locadora ficam visíveis para quem acessar seu link. Despublicar impede novas consultas à vitrine.</p>
    {context.role === "owner" ? <PublicationForm status={org.storefront_status} /> : <p>Somente a conta proprietária pode publicar ou despublicar a vitrine.</p>}
    {org.storefront_status === "published" && storefrontSlug.safeParse(org.slug).success && <p><a href={`/locadoras/${org.slug}`}>Ver página pública da locadora</a></p>}
    </section>
  </CentralShell>;
}
