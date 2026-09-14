import { z } from "zod";
import { isIndustryKey } from "@/lib/industry/registry";

// Minimal but real validation: ISO alpha-2 country, ISO 4217 currency,
// IANA timezone, BCP-47 locale. We don't ship a bundled list of every valid
// code (large, changes over time) — we check shape/casing and, where the
// runtime can verify it for free, IANA timezone validity via Intl.

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  countryCode: z.string().length(2).regex(/^[A-Z]{2}$/, "Use an ISO 3166-1 alpha-2 code, e.g. US"),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/, "Use an ISO 4217 code, e.g. USD"),
  timezone: z.string().refine(isValidTimezone, "Use an IANA timezone, e.g. America/New_York"),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a BCP-47 locale, e.g. en-US"),
  industryKey: z.string().refine(isIndustryKey, "Unknown industry"),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const changeIndustrySchema = z.object({
  industryKey: z.string().refine(isIndustryKey, "Unknown industry"),
});

function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
