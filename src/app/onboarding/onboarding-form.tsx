"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { FormActions, FormField } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { createOrganizationAction } from "@/lib/organization/actions";
import { INDUSTRIES } from "@/lib/industry/registry";
import { composeLocale } from "@/lib/reference/locale-data";

const DETECTED_TIMEZONE = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

const INDUSTRY_OPTIONS: ComboboxOption[] = INDUSTRIES.map((industry) => ({
  value: industry.key,
  label: industry.label,
}));

/**
 * Reference lists are resolved on the server (ICU data is large and identical
 * for every visitor) and handed down as options, so the form ships no country
 * or currency table of its own.
 */
export function OnboardingForm({
  countries,
  currencies,
  languages,
  timezones,
}: {
  countries: ComboboxOption[];
  currencies: ComboboxOption[];
  languages: ComboboxOption[];
  timezones: ComboboxOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [industryKey, setIndustryKey] = useState<string>(INDUSTRIES[0].key);
  const [countryCode, setCountryCode] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState(
    timezones.some((option) => option.value === DETECTED_TIMEZONE) ? DETECTED_TIMEZONE : "UTC",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = name.trim().length >= 2 && countryCode !== "" && currencyCode !== "";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createOrganizationAction({
        name,
        countryCode,
        currencyCode,
        timezone,
        locale: composeLocale(language, countryCode),
        industryKey,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField label="Business name" required>
        {(field) => (
          <Input
            {...field}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Auto Care"
            autoComplete="organization"
          />
        )}
      </FormField>

      <FormField
        label="Industry"
        description="Shapes the terminology and modules you see across the app."
        required
      >
        {(field) => (
          <Combobox
            id={field.id}
            describedBy={field["aria-describedby"]}
            options={INDUSTRY_OPTIONS}
            value={industryKey}
            onValueChange={setIndustryKey}
            placeholder="Choose an industry"
            searchPlaceholder="Search industries…"
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Country" required>
          {(field) => (
            <Combobox
              id={field.id}
              options={countries}
              value={countryCode}
              onValueChange={setCountryCode}
              placeholder="Choose a country"
              searchPlaceholder="Search countries…"
            />
          )}
        </FormField>

        <FormField label="Currency" description="Used for every price and total." required>
          {(field) => (
            <Combobox
              id={field.id}
              describedBy={field["aria-describedby"]}
              options={currencies}
              value={currencyCode}
              onValueChange={setCurrencyCode}
              placeholder="Choose a currency"
              searchPlaceholder="Search currencies…"
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Language" description="Controls number and date formatting.">
          {(field) => (
            <Combobox
              id={field.id}
              describedBy={field["aria-describedby"]}
              options={languages}
              value={language}
              onValueChange={setLanguage}
              placeholder="Choose a language"
              searchPlaceholder="Search languages…"
            />
          )}
        </FormField>

        <FormField label="Timezone" description="Detected from your device — change it if it looks wrong.">
          {(field) => (
            <Combobox
              id={field.id}
              describedBy={field["aria-describedby"]}
              options={timezones}
              value={timezone}
              onValueChange={setTimezone}
              placeholder="Choose a timezone"
              searchPlaceholder="Search timezones…"
            />
          )}
        </FormField>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <FormActions>
        <Button type="submit" size="lg" loading={isPending} disabled={!canSubmit}>
          {isPending ? "Creating…" : "Create business"}
        </Button>
      </FormActions>
    </form>
  );
}
