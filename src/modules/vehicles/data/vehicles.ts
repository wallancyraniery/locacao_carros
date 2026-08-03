import type { Vehicle } from "@/types/vehicle";

export const vehicles: Vehicle[] = [
  { id: "uno_vivace_2013", model: "Fiat Uno Vivace", year: 2013, color: "Branco", weeklyPrice: 650, status: "available", isConfirmed: true },
  { id: "kwid_zen_2022", model: "Renault Kwid Zen", year: 2022, color: "Branco", weeklyPrice: 699, status: "available", isConfirmed: false },
  { id: "mobi_like_2023", model: "Fiat Mobi Like", year: 2023, color: "Prata", weeklyPrice: 729, status: "rented", isConfirmed: false },
  { id: "onix_2022", model: "Chevrolet Onix", year: 2022, color: "Cinza", weeklyPrice: 789, status: "maintenance", isConfirmed: false },
];
