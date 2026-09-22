import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import Image from "next/image";
import { availabilityQuerySchema } from "@/modules/vehicles/domain/availability_period";
import { queryAvailability } from "@/modules/vehicles/application/query_availability.server";
import { availabilityRepository } from "@/modules/vehicles/infrastructure/availability_repository.server";
import { vehicles } from "@/modules/vehicles/data/vehicles";
import { formatRentalMoney, rentalTerms } from "@/modules/rentals/domain/rental_terms";
import { getTurnstileWidgetConfiguration } from "@/config/turnstile_environment.server";
import { getPrivacyNoticeConfiguration } from "@/config/privacy_notice_environment.server";
import { PrivacyNotice } from "@/modules/leads/components/privacy_notice";
import { ReservationRequestForm } from "@/modules/reservations/components/reservation_request_form";
import { submitReservationRequestAction } from "@/modules/reservations/actions/submit_reservation_request_action";
import { formatCivilDate } from "@/modules/reservations/components/civil_date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Solicitar reserva | Locação de veículos", robots: { index: false, follow: false } };

type Params = Record<string, string | string[] | undefined>;
export default async function ReservationPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const parsed = availabilityQuerySchema.safeParse({ vehicleId: params.vehicle, pickupDate: params.pickupDate, returnDate: params.returnDate });
  const vehicle = typeof params.vehicle === "string" ? vehicles.find(({ id }) => id === params.vehicle) : undefined;
  if (!parsed.success || !vehicle) return <main className="interest-page reservation-page">
    <Link href="/#veiculos" className="back-link">← Voltar aos veículos</Link>
    <section className="availability-message"><p className="eyebrow">Solicitação de reserva</p><h1>Revise o período escolhido</h1>
      <p>Selecione um veículo e informe uma data de devolução posterior à retirada para continuar.</p>
      <Link className="button primary" href={vehicle ? `/veiculos/${vehicle.id}#disponibilidade` : "/#veiculos"}>Escolher veículo e datas</Link>
    </section>
  </main>;
  const period = parsed.data;
  const changeDatesHref = `/veiculos/${vehicle.id}?${new URLSearchParams({ pickupDate: period.pickupDate, returnDate: period.returnDate })}#disponibilidade`;
  const availability = await queryAvailability(availabilityRepository, period);
  const action = submitReservationRequestAction.bind(null, { ...period, operationId: randomUUID() });
  return <main className="interest-page reservation-page">
    <Link href={changeDatesHref} className="back-link">← Voltar ao veículo e às datas</Link>
    <header className="reservation-heading"><p className="eyebrow">Solicitação de reserva · Revise e envie</p><h1>Confira sua solicitação</h1><p className="lead-dark">Revise o veículo, o período e as condições antes de informar seus dados.</p></header>
    <div className="interest-layout reservation-layout">
      <section className="reservation-summary" aria-labelledby="reservation-summary-title">
        <h2 id="reservation-summary-title">Resumo da solicitação</h2>
        <Image src={vehicle.image.src} alt={vehicle.image.alt} width={480} height={320} className="reservation-photo" sizes="(max-width: 800px) 90vw, 380px" />
        <p className="field-help">Imagem ilustrativa</p><h3>{vehicle.model}</h3>
        <dl className="reservation-dates"><div><dt>Retirada</dt><dd><time dateTime={period.pickupDate}>{formatCivilDate(period.pickupDate)}</time></dd></div><div><dt>Devolução</dt><dd><time dateTime={period.returnDate}>{formatCivilDate(period.returnDate)}</time></dd></div></dl>
        <Link href={changeDatesHref}>Alterar datas</Link>
        <aside className="interest-terms" aria-labelledby="reservation-terms-title"><h2 id="reservation-terms-title">Condições principais</h2><ul>
          <li>{formatRentalMoney(rentalTerms.weeklyRentalCents)} por semana</li><li>Caução de {formatRentalMoney(rentalTerms.securityDepositCents)}</li><li>Valor inicial de {formatRentalMoney(rentalTerms.initialTotalCents)}</li>
          <li>{rentalTerms.paymentMethods.join(" ou ")}; caução em até {rentalTerms.securityDepositMaxInstallments} vezes sem juros</li><li>Devolução da caução em até {rentalTerms.securityDepositRefundMaxDays} dias após encerramento e vistoria</li>
        </ul><p className="field-help">Os valores acima são as condições principais, não um orçamento calculado para o período.</p></aside>
        <div className="form-warning"><strong>A confirmação vem após a análise</strong><p>A consulta orienta sua escolha. A locadora ainda fará a análise: o envio não é aprovação e o período não está confirmado até aprovação.</p></div>
        <PrivacyNotice configuration={getPrivacyNoticeConfiguration()} purpose="reservation" />
      </section>
      {availability.status === "available" ? <ReservationRequestForm action={action} changeDatesHref={changeDatesHref} turnstileIdempotencyKey={randomUUID()} turnstile={getTurnstileWidgetConfiguration()} />
        : availability.status === "unavailable"
          ? <section className="availability-message" role="status"><h2>Escolha outras datas</h2><p>Esse veículo não está disponível nesse período.</p><Link className="button primary" href={changeDatesHref}>Escolher novas datas</Link></section>
          : <section className="availability-message" role="status"><h2>Consulte novamente</h2><p>{availability.status === "invalid" ? "Informe datas válidas. A devolução deve ser posterior à retirada." : "Não foi possível confirmar a disponibilidade agora. Tente novamente em instantes."}</p><Link className="button primary" href={changeDatesHref}>Consultar disponibilidade novamente</Link></section>}
    </div>
  </main>;
}
