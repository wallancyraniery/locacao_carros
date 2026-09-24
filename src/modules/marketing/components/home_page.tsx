import Link from "next/link";
import { ImproveBrand } from "@/modules/ui/brand";
import { Icon } from "@/modules/ui/icon";
import { VehicleList } from "@/modules/vehicles/components/vehicle_list";
import { formatRentalMoney, rentalTerms } from "@/modules/rentals/domain/rental_terms";
import type { Vehicle } from "@/types/vehicle";

const steps = ["Escolha o veículo", "Envie seu interesse", "Aguarde a análise", "Retire após a aprovação"];

export function HomePage({ vehicles }: { vehicles: Vehicle[] }) { return <>
  <header className="site-header home-header"><a className="wordmark" href="#inicio" aria-label="Improve — Início"><ImproveBrand /></a><span className="caption">Locação de veículos</span></header>
  <main id="inicio">
    <section className="home-intro section" aria-label="Escolha sua jornada"><p className="eyebrow">Improve · Locação de veículos</p><h1>Seu próximo passo começa aqui.</h1><p className="home-lead">Para quem precisa de um veículo. Para quem cuida de uma locadora.</p>
      <div className="journey-grid"><a className="journey-card" href="#alugar" aria-labelledby="renter-journey-title"><Icon name="vehicle" /><h2 id="renter-journey-title">Quero alugar um veículo</h2><p>Conheça a frota pelo link da sua locadora. Sem precisar criar conta.</p><span className="journey-action">Como encontrar um veículo <span aria-hidden="true">↗</span></span></a><Link className="journey-card journey-owner" aria-labelledby="owner-journey-title" href="/admin/login" prefetch={false}><Icon name="building" /><h2 id="owner-journey-title">Sou locadora</h2><p>Acesse sua Central para acompanhar a frota e os interessados.</p><span className="journey-action">Entrar na Central <span aria-hidden="true">↗</span></span></Link></div>
    </section>
    <section className="section renter-guidance" id="alugar"><div><p className="eyebrow">Para alugar</p><h2>Comece pelo link da sua locadora</h2></div><div><p>Acesse o link público compartilhado pela locadora para conhecer seus veículos, sem precisar criar conta. A busca entre várias locadoras ainda não está disponível.</p><p>Abaixo você pode conhecer nosso catálogo demonstrativo e seu fluxo de interesse.</p><a className="text-link" href="#veiculos">Consultar veículos demonstrativos →</a></div></section>
    <section className="section" id="veiculos"><div className="section-heading"><div><p className="eyebrow">Catálogo demonstrativo</p><h2>Conheça a experiência de locação</h2></div><p>Os veículos são demonstrativos. A opção de interesse acompanha a disponibilidade registrada e ainda depende de confirmação final da locadora.</p></div><VehicleList vehicles={vehicles} /></section>
    <section className="section rental-terms" aria-labelledby="rental-terms-title"><div className="section-heading"><div><p className="eyebrow">Condições do catálogo demonstrativo</p><h2 id="rental-terms-title">Valores e caução</h2></div><p>{rentalTerms.decisionNotice}</p></div><dl className="terms-grid"><div><dt>Aluguel semanal</dt><dd>{formatRentalMoney(rentalTerms.weeklyRentalCents)}</dd></div><div><dt>Caução</dt><dd>{formatRentalMoney(rentalTerms.securityDepositCents)}</dd></div><div><dt>Valor inicial</dt><dd>{formatRentalMoney(rentalTerms.initialTotalCents)}</dd></div><div><dt>Pagamento</dt><dd>{rentalTerms.paymentMethods.join(" ou ")}</dd></div></dl><p>A caução pode ser parcelada em até {rentalTerms.securityDepositMaxInstallments} vezes sem juros e será devolvida em até {rentalTerms.securityDepositRefundMaxDays} dias após o encerramento do contrato e a vistoria.</p><p>{rentalTerms.securityDepositRefundCondition}</p></section>
    <section className="section process" id="como-funciona"><div className="section-heading"><div><p className="eyebrow">Jornada simples</p><h2>Como funciona</h2></div><p>A disponibilidade, as condições da locação e a aprovação dependem de análise e confirmação da locadora.</p></div><ol>{steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></li>)}</ol></section>
  </main><footer><p>Disponibilidade, aprovação e condições finais dependem da análise da locadora.</p><a href="#inicio">Voltar ao início ↑</a></footer>
  </>; }
