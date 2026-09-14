/*
 * Reference data for country / currency / language / timezone selectors.
 *
 * Every list is derived from the runtime's ICU data (Intl) rather than a
 * hand-written table: ICU is a real, maintained reference source, it ships
 * with Node, and it gives localized display names for free. Nothing here is
 * invented, and no country is privileged over another — the product has to
 * work for any international business.
 *
 * Lists are computed once per process and memoized; they never change at
 * runtime.
 */

export interface ReferenceOption {
  value: string;
  label: string;
  /** Extra text the combobox should match on (e.g. the raw code). */
  keywords?: string;
  hint?: string;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function memoize<T>(factory: () => T): () => T {
  let cached: T | undefined;
  return () => {
    if (cached === undefined) cached = factory();
    return cached;
  };
}

/**
 * ICU has no "list all regions" API, so candidate alpha-2 codes are probed and
 * kept only when ICU resolves them to a real name (an unknown code resolves
 * back to itself).
 */
export const getCountryOptions = memoize<ReferenceOption[]>(() => {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  const options: ReferenceOption[] = [];

  for (const first of ALPHABET) {
    for (const second of ALPHABET) {
      const code = `${first}${second}`;
      try {
        const label = displayNames.of(code);
        if (label && label !== code) {
          options.push({ value: code, label, keywords: code, hint: code });
        }
      } catch {
        // Not a code ICU recognizes; skip it.
      }
    }
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
});

export const getCurrencyOptions = memoize<ReferenceOption[]>(() => {
  const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });

  return Intl.supportedValuesOf("currency")
    .map((code) => {
      let label = code;
      try {
        label = displayNames.of(code) ?? code;
      } catch {
        label = code;
      }
      return { value: code, label: `${label} (${code})`, keywords: code, hint: code };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
});

export const getLanguageOptions = memoize<ReferenceOption[]>(() => {
  const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
  const options: ReferenceOption[] = [];

  for (const first of ALPHABET) {
    for (const second of ALPHABET) {
      const code = `${first}${second}`.toLowerCase();
      try {
        const label = displayNames.of(code);
        if (label && label !== code) {
          options.push({ value: code, label, keywords: code, hint: code });
        }
      } catch {
        // Not a language ICU recognizes; skip it.
      }
    }
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
});

export const getTimezoneOptions = memoize<ReferenceOption[]>(() =>
  Intl.supportedValuesOf("timeZone").map((zone) => ({
    value: zone,
    label: zone.replace(/_/g, " "),
    keywords: zone,
  })),
);

/** BCP-47 locale from a language subtag plus the already-chosen country. */
export function composeLocale(language: string, countryCode: string): string {
  return countryCode ? `${language}-${countryCode.toUpperCase()}` : language;
}

export function splitLocale(locale: string): { language: string; region: string } {
  const [language = "en", region = ""] = locale.split("-");
  return { language: language.toLowerCase(), region: region.toUpperCase() };
}

/*
 * Deliberately absent: a country -> currency suggestion. ICU exposes no
 * region-to-currency mapping (Intl.NumberFormat echoes back whatever currency
 * you hand it, so "inferring" from the locale silently returns the input), and
 * a hand-maintained mapping of 250 territories is exactly the kind of invented
 * reference data this project refuses to ship. The currency combobox is
 * searchable, which is honest and costs the user one keystroke.
 */
