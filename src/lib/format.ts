export function formatMoney(amount: number | string, currencyCode: string, locale: string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode }).format(value);
}
