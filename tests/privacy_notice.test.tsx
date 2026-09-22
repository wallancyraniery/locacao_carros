import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parsePrivacyNoticeEnvironment, PrivacyNoticeEnvironmentError } from "@/config/privacy_notice_environment";
import { PrivacyNotice } from "@/modules/leads/components/privacy_notice";

describe("aviso público de privacidade", () => {
  it("informa finalidade, campos e retenção sem inventar controlador ou canal", () => {
    render(<PrivacyNotice configuration={{ mode: "pending" }} />);
    expect(screen.getByText(/analisar esta manifestação de interesse e realizar contato/)).toBeInTheDocument();
    expect(screen.getByText(/Prestadores técnicos podem tratar esses dados em nome da locadora/)).toBeInTheDocument();
    expect(screen.getByText(/nome, telefone, e-mail opcional, cidade/)).toBeInTheDocument();
    expect(screen.getByText(/90 dias a partir do registro do envio/)).toBeInTheDocument();
    expect(screen.getByText(/identidade jurídica do controlador e o canal oficial.*ainda serão informados/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("mantém exatamente os campos aprovados no formulário público", () => {
    const source = [
      readFileSync("src/modules/leads/components/lead_form.tsx", "utf8"),
      readFileSync("src/modules/leads/components/lead_fields.tsx", "utf8"),
      readFileSync("src/modules/leads/components/turnstile_field.tsx", "utf8"),
    ].join("\n");
    const fields = [...new Set([...source.matchAll(/name="([^"]+)"/g)].map((match) => match[1]))].sort();
    expect(fields).toEqual([
      "acknowledgement", "city", "driverPlatform", "eligibilityAcknowledgement", "email", "fullName",
      "hasDefinitiveLicense", "hasEar", "operationId", "phone", "preferredContactTime", "turnstileIdempotencyKey",
      "turnstileToken", "usagePurpose", "vehicleId", "website",
    ]);
    for (const field of fields) {
      expect(field).not.toMatch(/^(?:cpf|rg|cnhNumber|cnhImage|proofOfAddress|criminalRecords|cardNumber|bankAccount)$/i);
    }
  });

  it("exibe somente a identidade e o canal fornecidos pela configuração", () => {
    render(<PrivacyNotice configuration={{
      mode: "configured",
      controllerName: "Controlador sintético",
      contactLabel: "Canal sintético",
      contactHref: "mailto:privacidade@empresa.test",
    }} />);
    expect(screen.getByText("Controlador sintético")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Canal sintético" })).toHaveAttribute("href", "mailto:privacidade@empresa.test");
  });
});

describe("gate da configuração de privacidade", () => {
  it("permite estado pendente somente fora de produção", () => {
    expect(parsePrivacyNoticeEnvironment({ NODE_ENV: "development" })).toEqual({ mode: "pending" });
    expect(() => parsePrivacyNoticeEnvironment({ NODE_ENV: "production" })).toThrow(PrivacyNoticeEnvironmentError);
  });

  it("recusa configuração parcial, fictícia ou com URL autenticada em produção", () => {
    const base = {
      NODE_ENV: "production",
      PRIVACY_CONTROLLER_NAME: "Locadora oficial",
      PRIVACY_CONTACT_LABEL: "Canal de privacidade",
      PRIVACY_CONTACT_URL: "https://usuario:senha@locadora.test/privacidade",
    };
    expect(() => parsePrivacyNoticeEnvironment(base)).toThrow(PrivacyNoticeEnvironmentError);
    expect(() => parsePrivacyNoticeEnvironment({ ...base, PRIVACY_CONTACT_URL: "https://example.com" })).toThrow(PrivacyNoticeEnvironmentError);
    expect(() => parsePrivacyNoticeEnvironment({ ...base, PRIVACY_CONTACT_URL: "mailto:privacidade@locadora.test" })).toThrow(PrivacyNoticeEnvironmentError);
    expect(() => parsePrivacyNoticeEnvironment({ ...base, PRIVACY_CONTACT_URL: "mailto:privacidade@locadora.com.br" })).not.toThrow();
  });
});
