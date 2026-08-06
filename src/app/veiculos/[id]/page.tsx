import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRentalMoney, rentalTerms } from "@/modules/rentals/domain/rental_terms";
import { vehicles } from "@/modules/vehicles/data/vehicles";

type VehicleDetailPageProps = { params: Promise<{ id: string }> };

function findVehicle(id: string) {
  return vehicles.find((vehicle) => vehicle.id === id);
}

export async function generateMetadata({ params }: VehicleDetailPageProps): Promise<Metadata> {
  const vehicle = findVehicle((await params).id);
  return vehicle ? { title: `${vehicle.model} | Locação de veículos`, description: `Detalhes para consulta do ${vehicle.model}.` } : {};
}

export default async function VehicleDetailPage({ params }: VehicleDetailPageProps) {
  const vehicle = findVehicle((await params).id);
  if (!vehicle) notFound();

  return <main className="vehicle-detail-page">
    <Link href="/#veiculos" className="back-link">← Voltar ao catálogo</Link>
    <article className="vehicle-detail">
      <div className="vehicle-detail-media"><Image src={vehicle.image.src} alt={vehicle.image.alt} width={1536} height={1024} sizes="(max-width: 900px) calc(100vw - 40px), 58vw" className="vehicle-detail-photo" /><span>Imagem ilustrativa</span></div>
      <div className="vehicle-detail-content">
        <p className="eyebrow">Detalhes para consulta</p>
        <div className="detail-heading"><h1>{vehicle.model}</h1><span className="status status-consultation">{vehicle.availabilityLabel}</span></div>
        <p className="illustrative-notice">A imagem é ilustrativa e não representa necessariamente o veículo real.</p>
        <dl className="detail-specs"><div><dt>Ano</dt><dd>{vehicle.year ?? "Ano a confirmar"}</dd></div><div><dt>Cor</dt><dd>{vehicle.color}</dd></div><div><dt>Câmbio</dt><dd>{vehicle.transmission}</dd></div><div><dt>Característica informada</dt><dd>{vehicle.feature}</dd></div></dl>
        <section className="detail-terms" aria-labelledby="detail-terms-title"><h2 id="detail-terms-title">Condições principais</h2><dl><div><dt>Aluguel semanal</dt><dd>{formatRentalMoney(rentalTerms.weeklyRentalCents)}</dd></div><div><dt>Caução</dt><dd>{formatRentalMoney(rentalTerms.securityDepositCents)}</dd></div><div><dt>Total inicial</dt><dd>{formatRentalMoney(rentalTerms.initialTotalCents)}</dd></div><div><dt>Pagamento</dt><dd>{rentalTerms.paymentMethods.join(" ou ")}</dd></div></dl><p>A caução pode ser parcelada em até {rentalTerms.securityDepositMaxInstallments} vezes sem juros.</p><p>A devolução ocorre em até {rentalTerms.securityDepositRefundMaxDays} dias após o encerramento e a vistoria, conforme o contrato e as condições do veículo.</p></section>
        <p className="detail-warning">A manifestação de interesse não garante aprovação ou disponibilidade.</p>
        <Link href={`/interesse?vehicle=${vehicle.id}`} className="button primary detail-action">Tenho interesse</Link>
      </div>
    </article>
  </main>;
}
