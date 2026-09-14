import { describe, expect, it } from "vitest";
import { createOrganizationSchema } from "@/lib/validation/organization";
import { createCustomerSchema } from "@/lib/validation/customer";

/*
 * These assert the *messages*, not just that validation fails. The raw
 * validator output ("Too small: expected string to have exactly 3 characters")
 * is what reached a real user during onboarding, so the wording is part of the
 * contract, not incidental.
 */

const validOrganization = {
  name: "Acme Auto Care",
  countryCode: "IN",
  currencyCode: "INR",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  industryKey: "automobile_workshop",
};

function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return result.error?.issues[0]?.message ?? "";
}

describe("organization validation", () => {
  it("accepts a well-formed international organization", () => {
    expect(createOrganizationSchema.safeParse(validOrganization).success).toBe(true);
  });

  it("is not hardcoded to one country", () => {
    for (const variant of [
      { countryCode: "US", currencyCode: "USD", locale: "en-US", timezone: "America/New_York" },
      { countryCode: "DE", currencyCode: "EUR", locale: "de-DE", timezone: "Europe/Berlin" },
      { countryCode: "AE", currencyCode: "AED", locale: "ar-AE", timezone: "Asia/Dubai" },
    ]) {
      expect(createOrganizationSchema.safeParse({ ...validOrganization, ...variant }).success).toBe(true);
    }
  });

  it("explains what a currency code should look like instead of leaking a length constraint", () => {
    const result = createOrganizationSchema.safeParse({ ...validOrganization, currencyCode: "Rs" });

    expect(result.success).toBe(false);
    expect(firstError(result)).toBe("Currency must be a 3-letter currency code, such as USD, EUR, or INR.");
    expect(firstError(result)).not.toMatch(/Too small|expected string|characters$/);
  });

  it("normalizes a lowercase currency rather than rejecting it", () => {
    const result = createOrganizationSchema.safeParse({ ...validOrganization, currencyCode: "inr" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currencyCode).toBe("INR");
  });

  it("rejects a timezone the runtime does not recognize", () => {
    const result = createOrganizationSchema.safeParse({ ...validOrganization, timezone: "Mars/Olympus" });

    expect(result.success).toBe(false);
    expect(firstError(result)).toContain("Choose a timezone");
  });

  it("rejects an unknown industry key", () => {
    const result = createOrganizationSchema.safeParse({ ...validOrganization, industryKey: "time_travel" });

    expect(result.success).toBe(false);
    expect(firstError(result)).toBe("Choose an industry from the list.");
  });
});

describe("customer validation", () => {
  it("requires a name in plain language", () => {
    const result = createCustomerSchema.safeParse({ type: "INDIVIDUAL", name: "  " });

    expect(result.success).toBe(false);
    expect(firstError(result)).toBe("Enter a name.");
  });

  it("accepts an empty email, since it is optional", () => {
    expect(createCustomerSchema.safeParse({ type: "INDIVIDUAL", name: "Ada", email: "" }).success).toBe(true);
  });

  it("explains a malformed email with an example", () => {
    const result = createCustomerSchema.safeParse({ type: "INDIVIDUAL", name: "Ada", email: "not-an-email" });

    expect(result.success).toBe(false);
    expect(firstError(result)).toContain("name@example.com");
  });

  it("defaults a new customer to LEAD", () => {
    const result = createCustomerSchema.safeParse({ type: "INDIVIDUAL", name: "Ada" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("LEAD");
  });
});
