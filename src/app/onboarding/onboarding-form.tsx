"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganizationAction } from "@/lib/organization/actions";
import { INDUSTRIES } from "@/lib/industry/registry";

const DEFAULT_TIMEZONE =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [locale, setLocale] = useState("en-US");
  const [industryKey, setIndustryKey] = useState<string>(INDUSTRIES[0].key);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createOrganizationAction({
        name,
        countryCode: countryCode.toUpperCase(),
        currencyCode: currencyCode.toUpperCase(),
        timezone: DEFAULT_TIMEZONE,
        locale,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Business name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Auto Care" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="industry">Industry</Label>
        <select
          id="industry"
          value={industryKey}
          onChange={(e) => setIndustryKey(e.target.value)}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm"
        >
          {INDUSTRIES.map((industry) => (
            <option key={industry.key} value={industry.key}>
              {industry.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="country">Country code</Label>
          <Input
            id="country"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            placeholder="US"
            maxLength={2}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="currency">Currency code</Label>
          <Input
            id="currency"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            placeholder="USD"
            maxLength={3}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="locale">Locale</Label>
        <Input id="locale" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US" required />
      </div>

      <p className="text-xs text-muted-foreground">
        Timezone detected as <span className="text-foreground">{DEFAULT_TIMEZONE}</span>.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={isPending || !name}>
        {isPending ? "Creating…" : "Create business"}
      </Button>
    </form>
  );
}
