import { z } from "zod";
import { isIndustryKey } from "@/lib/industry/registry";

/*
 * Validation shape is unchanged (ISO 3166-1 alpha-2 country, ISO 4217
 * currency, IANA timezone, BCP-47 locale) — what changed is that every message
 * is written for the person filling in the form. A validator's default output
 * ("Too small: expected string to have exactly 3 characters") describes the
 * constraint to a developer and tells the user nothing about what to type.
 */

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your business name (at least 2 characters).")
    .max(120, "Business name can be at most 120 characters."),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose a country from the list."),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter currency code, such as USD, EUR, or INR."),
  timezone: z.string().trim().refine(isValidTimezone, "Choose a timezone from the list, such as America/New_York."),
  locale: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Choose a language from the list."),
  industryKey: z.string().refine(isIndustryKey, "Choose an industry from the list."),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const changeIndustrySchema = z.object({
  industryKey: z.string().refine(isIndustryKey, "Choose an industry from the list."),
});

function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
