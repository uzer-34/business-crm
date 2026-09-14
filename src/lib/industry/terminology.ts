import type { IndustryKey } from "./registry";

// The "intelligence" half of "generic core + industry intelligence" (brief
// §29-32): the underlying Customer/Order models never change, only what
// they're called. Deliberately small — just the nouns that actually appear
// in nav and page headers today. Add a key here only once a real page needs
// to say it; this is not a general i18n system.
export type TermKey = "customer" | "customers" | "order" | "orders";

const DEFAULT_TERMINOLOGY: Record<TermKey, string> = {
  customer: "Customer",
  customers: "Customers",
  order: "Order",
  orders: "Orders",
};

// Only industries where the generic English noun would read strangely to
// that trade get an override — most of the INDUSTRIES list (jewellery,
// electronics_retail, furniture, distributor, professional_services,
// construction, ...) are perfectly well served by "Customer"/"Order" and
// intentionally have no entry here.
const INDUSTRY_TERMINOLOGY: Partial<Record<IndustryKey, Partial<Record<TermKey, string>>>> = {
  automobile_workshop: { order: "Job Card", orders: "Job Cards" },
  repair: { order: "Job Card", orders: "Job Cards" },
  salon: { customer: "Client", customers: "Clients" },
  clinic: { customer: "Patient", customers: "Patients" },
  hospital: { customer: "Patient", customers: "Patients" },
  restaurant: { customer: "Guest", customers: "Guests" },
  cafe: { customer: "Guest", customers: "Guests" },
  real_estate: { customer: "Client", customers: "Clients" },
  financial_services: { customer: "Client", customers: "Clients" },
};

export function getTerminology(industryKey: string): Record<TermKey, string> {
  const overrides = INDUSTRY_TERMINOLOGY[industryKey as IndustryKey];
  return overrides ? { ...DEFAULT_TERMINOLOGY, ...overrides } : DEFAULT_TERMINOLOGY;
}
