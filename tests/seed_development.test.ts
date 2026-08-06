import { describe, expect, it } from "vitest";
import { validateSeedCatalog } from "../scripts/validate_seed_catalog.mjs";

const validVehicle = { year: 2020, status: "available" };

function validationMessage(vehicles: Array<{ year?: unknown; status?: unknown }>) {
  try {
    validateSeedCatalog(vehicles);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

describe("seed de desenvolvimento", () => {
  it("aceita catálogo sintético com ano e disponibilidade confirmados", () => {
    expect(() => validateSeedCatalog([validVehicle, { year: 2022, status: "rented" }])).not.toThrow();
  });

  it("recusa ano não confirmado com mensagem segura", () => {
    const catalog = [validVehicle, { year: null, status: "available", confidentialMarker: "nao-expor-objeto" }];
    const message = validationMessage(catalog);

    expect(message).toBe("Seed recusado: existem veículos sem ano confirmado.");
    expect(message).not.toContain("nao-expor-objeto");
    expect(message).not.toContain(JSON.stringify(catalog));
  });

  it("recusa especificamente a disponibilidade quando todos os anos estão confirmados", () => {
    const catalog = [validVehicle, { year: 2022, status: undefined, confidentialMarker: "postgres://usuario:senha@servidor/base" }];
    const message = validationMessage(catalog);

    expect(message).toBe("Seed recusado: existem veículos sem disponibilidade confirmada.");
    expect(message).not.toContain("postgres://");
    expect(message).not.toContain("senha");
    expect(message).not.toContain(JSON.stringify(catalog));
  });

  it("prioriza o bloqueio de ano quando ano e disponibilidade não estão confirmados", () => {
    expect(validationMessage([{ year: null, status: undefined }])).toBe("Seed recusado: existem veículos sem ano confirmado.");
  });
});
