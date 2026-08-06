import { existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vehicles } from "@/modules/vehicles/data/vehicles";
import { VehicleList } from "@/modules/vehicles/components/vehicle_list";
import { getVehicleStatusLabel } from "@/modules/vehicles/lib/status";
import { vehicleStatuses } from "@/types/vehicle";
import { rentalTerms } from "@/modules/rentals/domain/rental_terms";
import { HomePage } from "@/modules/marketing/components/home_page";
import VehicleDetailPage from "@/app/veiculos/[id]/page";

const expectedVehicles = [
  { id: "20000000-0000-4000-8000-000000000001", model: "Fiat Uno Vivace", year: null, color: "Branco", image: "/vehicles/generated/fiat_uno_vivace_branco.png", alt: "Fiat Uno Vivace branco, imagem ilustrativa" },
  { id: "20000000-0000-4000-8000-000000000002", model: "Renault Clio", year: null, color: "Vermelho", image: "/vehicles/generated/renault_clio_vermelho.png", alt: "Renault Clio vermelho, imagem ilustrativa" },
  { id: "20000000-0000-4000-8000-000000000003", model: "Ford Fiesta", year: 2019, color: "Prata", image: "/vehicles/generated/ford_fiesta_prata.png", alt: "Ford Fiesta prata, imagem ilustrativa" },
  { id: "20000000-0000-4000-8000-000000000004", model: "Chevrolet Onix", year: 2022, color: "Prata", image: "/vehicles/generated/chevrolet_onix_prata.png", alt: "Chevrolet Onix prata, imagem ilustrativa" },
];

describe("veículos demonstrativos", () => {
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
    vehicles.forEach((vehicle) => expect(vehicle).toMatchObject({ transmission: "Manual", feature: "Completo", availabilityLabel: "Disponibilidade sob consulta" }));
    expect(JSON.stringify(vehicles)).not.toMatch(/ar-condicionado|direção|vidro|trava/i);
  });
  it("renderiza imagens ilustrativas, anos honestos e interesse para os quatro veículos", () => {
    render(<VehicleList />);
    expectedVehicles.forEach(({ id, model, alt }) => {
      expect(screen.getByRole("heading", { name: model })).toBeInTheDocument();
      expect(screen.getByAltText(alt)).toBeInTheDocument();
      expect(document.querySelector(`a[href="/veiculos/${id}"]`)).toHaveTextContent("Ver detalhes");
      expect(document.querySelector(`a[href="/interesse?vehicle=${id}"]`)).toBeInTheDocument();
    });
    expect(screen.getAllByText("Imagem ilustrativa")).toHaveLength(4);
    expect(screen.getAllByText("Disponibilidade sob consulta")).toHaveLength(4);
    expect(screen.getAllByText("Ano a confirmar")).toHaveLength(2);
    expect(screen.getAllByText("Manual")).toHaveLength(4);
    expect(screen.getAllByText("Completo")).toHaveLength(4);
  });
  it("usa somente a imagem fornecida no hero e mantém o título em HTML", () => {
    render(<HomePage />);
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
  });
});
