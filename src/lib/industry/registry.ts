// Phase 1 stub for the Industry Engine (brief section 29-32). For now this is
// just a label registry so the org-creation form can offer real choices;
// terminology/workflow/dashboard adaptation is out of scope until Phase 10.

export const INDUSTRIES = [
  { key: "generic", label: "General / Other" },
  { key: "automobile_workshop", label: "Automobile Workshop" },
  { key: "clothing_retail", label: "Clothing / Fashion Retail" },
  { key: "jewellery", label: "Jewellery" },
  { key: "salon", label: "Salon" },
  { key: "restaurant", label: "Restaurant" },
  { key: "electronics_retail", label: "Electronics Store" },
  { key: "furniture", label: "Furniture" },
  { key: "construction", label: "Construction" },
  { key: "professional_services", label: "Professional Services" },
  { key: "repair", label: "Repair Services" },
  { key: "distributor", label: "Distributor / Wholesaler" },
  { key: "clinic", label: "Clinic" },
] as const;

export type IndustryKey = (typeof INDUSTRIES)[number]["key"];

export function isIndustryKey(value: string): value is IndustryKey {
  return INDUSTRIES.some((i) => i.key === value);
}
