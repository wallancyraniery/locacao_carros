import { describe, expect, it } from "vitest";
import { formatBrazilianPhoneForDisplay } from "@/modules/leads/domain/phone_display";

describe("telefone para apresentação", () => {
  it.each([
    ["11987654321", "(11) 98765-4321"],
    ["1134567890", "(11) 3456-7890"],
    ["(11) 98765-4321", "(11) 98765-4321"],
    ["(11) 3456-7890", "(11) 3456-7890"],
    ["11 98765.4321", "(11) 98765-4321"],
    ["11876543210", "(11) 87654-3210"],
    ["119876543210", "119876543210"],
    ["119876543", "119876543"],
    ["abc11987654321", "abc11987654321"],
    ["+5511987654321", "+5511987654321"],
    ["", ""],
  ])("formata %s sem inventar ou truncar dígitos", (input, expected) => {
    expect(formatBrazilianPhoneForDisplay(input)).toBe(expected);
    expect(formatBrazilianPhoneForDisplay(expected)).toBe(expected);
  });
});
