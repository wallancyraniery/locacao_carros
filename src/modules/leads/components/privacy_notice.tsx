import type { PrivacyNoticeConfiguration } from "@/config/privacy_notice_environment";

export function PrivacyNotice({ configuration, purpose = "interest" }: { configuration: PrivacyNoticeConfiguration; purpose?: "interest" | "reservation" }) {
  return <aside className="privacy-notice" aria-labelledby="privacy-notice-title">
    <h2 id="privacy-notice-title">Como seus dados serão usados</h2>
    <p>A locadora responsável pelo veículo usará os dados somente para analisar {purpose === "reservation" ? "esta solicitação de reserva" : "esta manifestação de interesse"} e realizar contato.</p>
    <p>Prestadores técnicos podem tratar esses dados em nome da locadora somente quando necessário para operar este fluxo.</p>
    <p>São solicitados nome, telefone, e-mail opcional, cidade, finalidade de uso, declarações sobre CNH e EAR, aplicativo e período de contato opcionais.</p>
    {purpose === "reservation" ? <p>Registros vinculados a solicitações de reserva são preservados pelo procedimento atual de retenção. As regras específicas de conservação desse histórico ainda precisam ser definidas pelo controlador.</p> : <p>O prazo de retenção do interesse que não evoluir para locação é de 90 dias a partir do registro do envio. Ao completar esse prazo, a eliminação depende de execução administrativa controlada. Registros que evoluírem para locação ficam fora desse procedimento; suas regras de conservação ainda precisam ser definidas pelo controlador.</p>}
    {configuration.mode === "configured"
      ? <p>Controlador: <strong>{configuration.controllerName}</strong>. Solicitações sobre seus dados: <a href={configuration.contactHref}>{configuration.contactLabel}</a>.</p>
      : <p><strong>Publicação pendente:</strong> a identidade jurídica do controlador e o canal oficial para solicitações sobre dados ainda serão informados antes do uso público.</p>}
  </aside>;
}
