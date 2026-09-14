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
  { key: "cafe", label: "Cafe" },
  { key: "electronics_retail", label: "Electronics Store" },
  { key: "furniture", label: "Furniture" },
  { key: "construction", label: "Construction" },
  { key: "professional_services", label: "Professional Services" },
  { key: "repair", label: "Repair Services" },
  { key: "distributor", label: "Distributor / Wholesaler" },
  { key: "clinic", label: "Clinic" },
  { key: "hospital", label: "Hospital" },
  { key: "manufacturing", label: "Factory / Manufacturing" },
  { key: "grocery_retail", label: "Grocery / Kirana Store" },
  { key: "supermarket_retail", label: "Supermarket / Hypermarket" },
  { key: "textiles", label: "Textiles" },
  { key: "real_estate", label: "Real Estate" },
  { key: "financial_services", label: "Financial Services" },
] as const;

export type IndustryKey = (typeof INDUSTRIES)[number]["key"];

export function isIndustryKey(value: string): value is IndustryKey {
  return INDUSTRIES.some((i) => i.key === value);
}

// Phase 11's Vehicle module (plate/VIN/mileage tracking, job cards linked
// to a vehicle) is only useful to a business that actually services
// vehicles — surfacing it for a jeweller or a restaurant would just be
// clutter. Small, explicit allowlist rather than a generic "industry has
// module X" config table, since exactly one module needs this check today.
const VEHICLE_TRACKING_INDUSTRIES: readonly IndustryKey[] = ["automobile_workshop", "repair"];

export function tracksVehicles(industryKey: string): boolean {
  return (VEHICLE_TRACKING_INDUSTRIES as readonly string[]).includes(industryKey);
}
