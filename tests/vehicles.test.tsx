import { existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadCatalogVehicle = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/modules/vehicles/infrastructure/catalog_availability.server", () => ({ loadCatalogVehicle }));
import { vehicles } from "@/modules/vehicles/data/vehicles";
import { VehicleList } from "@/modules/vehicles/components/vehicle_list";
import { getVehicleStatusLabel } from "@/modules/vehicles/lib/status";
import { vehicleStatuses } from "@/types/vehicle";
import { rentalTerms } from "@/modules/rentals/domain/rental_terms";
import { HomePage } from "@/modules/marketing/components/home_page";
import VehicleDetailPage from "@/app/veiculos/[id]/page";
import InterestPage from "@/app/interesse/page";

const expectedVehicles = [
  { id: "20000000-0000-4000-8000-000000000001", model: "Fiat Uno Vivace", year: null, color: "Branco", image: "/vehicles/generated/fiat_uno_vivace_branco.png", alt: "Fiat Uno Vivace branco, imagem ilustrativa" },
  { id: "20000000-0000-4000-8000-000000000002", model: "Renault Clio", year: null, color: "Vermelho", image: "/vehicles/generated/renault_clio_vermelho.png", alt: "Renault Clio vermelho, imagem ilustrativa" },
  { id: "20000000-0000-4000-8000-000000000003", model: "Ford Fiesta", year: 2019, color: "Prata", image: "/vehicles/generated/ford_fiesta_prata.png", alt: "Ford Fiesta prata, imagem ilustrativa" },
  { id: "20000000-0000-4000-8000-000000000004", model: "Chevrolet Onix", year: 2022, color: "Prata", image: "/vehicles/generated/chevrolet_onix_prata.png", alt: "Chevrolet Onix prata, imagem ilustrativa" },
];

describe("veículos demonstrativos", () => {
  beforeEach(() => {
    loadCatalogVehicle.mockReset();
  });

  it("mantém os quatro modelos autorizados e seus UUIDs determinísticos", () => {
    expect(vehicles.map(({ id, model, year, color, image }) => ({ id, model, year, color, image: image.src }))).toEqual(expectedVehicles.map(({ id, model, year, color, image }) => ({ id, model, year, color, image })));
  });
  it("mantém cada caminho público declarado ligado a um arquivo existente", () => {
    for (const { image } of expectedVehicles) expect(existsSync(join(process.cwd(), "public", image))).toBe(true);
    expect(existsSync(join(process.cwd(), "public/hero/locadora_showroom.png"))).toBe(true);
  });
  it("deriva o preço semanal da fonte única de condições comerciais", () => vehicles.forEach(({ weeklyPrice }) => expect(weeklyPrice * 100).toBe(rentalTerms.weeklyRentalCents)));
  it("preserva todos os estados aceitos", () => expect(vehicleStatuses).toEqual(["available", "reserved", "rented", "maintenance", "inactive"]));
  it("traduz os estados", () => { expect(getVehicleStatusLabel("available")).toBe("Disponível"); expect(getVehicleStatusLabel("maintenance")).toBe("Em manutenção"); });
  it("mantém somente as características informadas, sem inferir equipamentos", () => {
    vehicles.forEach((vehicle) => expect(vehicle).toMatchObject({ transmission: "Manual", feature: "Completo", availabilityLabel: "Interesse indisponível", acceptsInterest: false }));
    expect(JSON.stringify(vehicles)).not.toMatch(/ar-condicionado|direção|vidro|trava/i);
  });
  it("renderiza imagens e permite interesse somente para disponibilidade confirmada", () => {
    const catalog = vehicles.map((vehicle, index) => index === 2 ? {
      ...vehicle, acceptsInterest: true, availabilityLabel: "Disponível para interesse" as const,
    } : vehicle);
    render(<VehicleList vehicles={catalog} />);
    expectedVehicles.forEach(({ id, model, alt }) => {
      expect(screen.getByRole("heading", { name: model })).toBeInTheDocument();
      expect(screen.getByAltText(alt)).toBeInTheDocument();
      expect(document.querySelector(`a[href="/veiculos/${id}"]`)).toHaveTextContent("Ver detalhes");
      if (id === expectedVehicles[2].id) expect(document.querySelector(`a[href="/interesse?vehicle=${id}"]`)).toBeInTheDocument();
      else expect(document.querySelector(`a[href="/interesse?vehicle=${id}"]`)).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Imagem ilustrativa")).toHaveLength(4);
    expect(screen.getByText("Disponível para interesse")).toBeInTheDocument();
    expect(screen.getAllByText("Interesse indisponível")).toHaveLength(6);
    expect(screen.getAllByText("Ano a confirmar")).toHaveLength(2);
    expect(screen.getAllByText("Manual")).toHaveLength(4);
    expect(screen.getAllByText("Completo")).toHaveLength(4);
  });
  it("usa somente a imagem fornecida no hero e mantém o título em HTML", () => {
    render(<HomePage vehicles={vehicles} />);
    expect(screen.getByRole("heading", { level: 1, name: "Seu próximo carro para trabalhar começa aqui" })).toBeInTheDocument();
    expect(screen.getByAltText("Fachada ilustrativa de uma locadora de veículos à noite")).toHaveAttribute("src", expect.stringContaining("locadora_showroom.png"));
    expect(document.querySelector(".hero-car")).not.toBeInTheDocument();
  });
  it("remove os veículos fictícios e não inventa anos", () => {
    const catalog = JSON.stringify(vehicles);
    expect(catalog).not.toMatch(/Kwid|Mobi|2013|2023/);
    expect(vehicles.find(({ model }) => model === "Fiat Uno Vivace")?.year).toBeNull();
    expect(vehicles.find(({ model }) => model === "Renault Clio")?.year).toBeNull();
  });
  it("mantém a mídia de detalhes no fluxo e isolada do conteúdo", async () => {
    loadCatalogVehicle.mockResolvedValueOnce(vehicles[0]);
    const page = await VehicleDetailPage({ params: Promise.resolve({ id: expectedVehicles[0].id }) });
    const { container } = render(page);
    const media = container.querySelector(".vehicle-detail-media");
    const content = container.querySelector(".vehicle-detail-content");
    const image = media?.querySelector<HTMLImageElement>(`img[alt="${expectedVehicles[0].alt}"]`) ?? null;
    expect(image).toBeInTheDocument();
    expect(media).toContainElement(image);
    expect(content).not.toContainElement(image);
    expect(image).toHaveClass("vehicle-detail-photo");
    expect(image).toHaveAttribute("width", "1536");
    expect(image).toHaveAttribute("height", "1024");
    expect(image).not.toHaveStyle({ position: "absolute" });
    expect(container.querySelector(".detail-terms dl")).toBeInTheDocument();
    expect(within(container).queryByRole("link", { name: "Tenho interesse" })).not.toBeInTheDocument();
    expect(within(container).getByText("Este veículo não está disponível para novas manifestações de interesse.")).toBeInTheDocument();
  });

  it("não renderiza o formulário quando o banco não confirma disponibilidade", async () => {
    loadCatalogVehicle.mockResolvedValueOnce(vehicles[0]);
    render(await InterestPage({ searchParams: Promise.resolve({ vehicle: vehicles[0].id }) }));
    expect(screen.getByRole("heading", { name: "Interesse indisponível" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar interesse" })).not.toBeInTheDocument();
  });

  it("renderiza o formulário somente quando o banco confirma disponibilidade", async () => {
    loadCatalogVehicle.mockResolvedValueOnce({
      ...vehicles[2], acceptsInterest: true, availabilityLabel: "Disponível para interesse",
    });
    const { container } = render(await InterestPage({ searchParams: Promise.resolve({ vehicle: vehicles[2].id }) }));
    expect(within(container).getByRole("button", { name: "Enviar interesse" })).toBeInTheDocument();
    expect(container.querySelector(`input[name="vehicleId"][value="${vehicles[2].id}"]`)).toBeInTheDocument();
  });
});
