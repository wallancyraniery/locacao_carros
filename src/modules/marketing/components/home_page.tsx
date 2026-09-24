import Link from "next/link";
import { ImproveBrand } from "@/modules/ui/brand";
import { FlowBackdrop } from "@/modules/ui/flow_backdrop";
import { Icon } from "@/modules/ui/icon";
import { VehicleList } from "@/modules/vehicles/components/vehicle_list";
import type { Vehicle } from "@/types/vehicle";

const renterSteps = ["Consulte os veículos", "Escolha uma opção", "Envie sua solicitação", "Aguarde confirmação"];
const ownerSteps = ["Crie sua locadora", "Organize a frota", "Publique sua vitrine", "Compartilhe seu link"];
const conditions = ["Valor da locação", "Caução", "Pagamento", "Documentação", "Retirada", "Regras específicas"];

export function HomePage({ vehicles }: { vehicles: Vehicle[] }) {
  return <>
    <header className="site-header home-header">
      <a className="wordmark" href="#inicio" aria-label="Improve — Início"><ImproveBrand /></a>
      <span className="caption">Locação de veículos</span>
    </header>
    <main id="inicio" className="platform-home">
      <div className="home-surface">
        <FlowBackdrop />
        <section className="home-intro section" aria-label="Escolha sua jornada">
          <p className="eyebrow">Pessoas, veículos e locadoras</p>
          <h1>Locação mais simples.<br /><span>Mais controle da frota.</span></h1>
          <p className="home-lead">Um caminho claro para quem precisa de um carro. Uma Central para quem cuida de uma locadora.</p>
          <div className="journey-grid">
            <a className="journey-card" href="#alugar" aria-labelledby="renter-journey-title">
              <Icon name="vehicle" /><h2 id="renter-journey-title">Quero alugar</h2>
              <p>Conheça a frota pelo link da sua locadora, sem criar conta.</p>
              <span className="journey-action">Veja por onde começar <span aria-hidden="true">↗</span></span>
            </a>
            <Link className="journey-card journey-owner" aria-labelledby="owner-journey-title" href="/admin/login" prefetch={false}>
              <Icon name="building" /><h2 id="owner-journey-title">Sou locadora</h2>
              <p>Organize seus veículos e publique a página da sua locadora.</p>
              <span className="journey-action">Entrar na Central <span aria-hidden="true">↗</span></span>
            </Link>
          </div>
        </section>
      </div>
      <section className="section home-catalog" id="alugar" aria-labelledby="demo-title">
        <div className="renter-guidance">
          <Icon name="pin" />
          <p><strong>Para alugar, comece pelo link da sua locadora.</strong> A busca entre várias locadoras ainda não está disponível. Abaixo, você pode explorar uma demonstração.</p>
        </div>
        <div className="section-heading" id="veiculos">
          <div><p className="eyebrow">Catálogo demonstrativo</p><h2 id="demo-title">Veja a experiência em prática</h2></div>
          <p>Veículos, imagens e valores de demonstração. Não representam uma oferta geral da Improve nem a frota de outras locadoras.</p>
        </div>
        <VehicleList vehicles={vehicles} />
      </section>
      <section className="section journey-process" id="como-funciona" aria-labelledby="process-title">
        <div className="section-heading"><div><p className="eyebrow">Do primeiro acesso ao próximo passo</p><h2 id="process-title">Como funciona</h2></div><p>Duas jornadas, com o papel de cada lado bem definido.</p></div>
        <div className="journey-flow">
          <div className="flow-label"><Icon name="vehicle" /><h3>Para quem aluga</h3><span className="status-badge">Fluxo demonstrativo</span></div>
          <ol>{renterSteps.map((step, index) => <li key={step}><span className="step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></li>)}</ol>
          <p>O envio ainda é exclusivo do catálogo demonstrativo e depende de análise da locadora. Nas vitrines reais, você pode consultar a frota; solicitações ainda não estão disponíveis.</p>
        </div>
        <div className="journey-flow">
          <div className="flow-label"><Icon name="building" /><h3>Para sua locadora</h3><span className="status-badge">Disponível na Central</span></div>
          <ol>{ownerSteps.map((step, index) => <li key={step}><span className="step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></li>)}</ol>
          <p>Você decide quando sua vitrine fica pública. A Central também reúne os interessados existentes; a gestão de reservas ainda não está disponível.</p>
        </div>
      </section>
      <section className="section owner-value" aria-labelledby="owner-value-title">
        <div><p className="eyebrow">Para a sua operação</p><h2 id="owner-value-title">Sua frota organizada.<br />Sua locadora em evidência.</h2><p>Veja os veículos cadastrados, acompanhe os dados da sua locadora e compartilhe uma vitrine com nome, cidade e frota próprios.</p><Link href="/admin/cadastro" className="text-link" prefetch={false}>Criar minha conta →</Link></div>
        <aside className="conditions-panel" aria-labelledby="conditions-title"><p className="eyebrow">Condições da locação</p><h3 id="conditions-title">Cada locadora define suas próprias condições.</h3><ul>{conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul><p>Confirme esses pontos com a locadora. A Improve não estabelece valores ou condições universais; a configuração dessas regras na vitrine ainda não está disponível.</p></aside>
      </section>
      <section className="section home-final" aria-labelledby="final-title"><div><p className="eyebrow">Central da locadora</p><h2 id="final-title">Comece pela sua frota.</h2><p>Crie sua conta e organize os primeiros veículos da sua locadora.</p></div><Link href="/admin/login" className="button primary" prefetch={false}>Acessar a Central <span aria-hidden="true">↗</span></Link></section>
    </main>
    <footer><p>Improve · Plataforma para locadoras</p><a href="#inicio">Voltar ao início ↑</a></footer>
  </>;
}
