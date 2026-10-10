/*
 * Tab definitions shared by the server page (which resolves ?tab= before
 * rendering) and the client detail component (which renders the tab links).
 *
 * Deliberately not inside the "use client" component file: a function exported
 * from a client module cannot be called during server rendering, only passed
 * as a prop — TypeScript does not model that boundary, so it fails at runtime
 * rather than at build time.
 */

export const BASE_TABS = ["Overview", "Activity", "Notes", "Tasks", "Orders"] as const;

export type Tab = (typeof BASE_TABS)[number] | "Invoices" | "Account" | "Vehicles";

export function toTabSlug(tab: string): string {
  return tab.toLowerCase();
}

export function tabsFor(includeVehicles: boolean, includeAccount: boolean): Tab[] {
  return [
    ...BASE_TABS,
    ...(includeAccount ? (["Invoices", "Account"] as const) : []),
    ...(includeVehicles ? (["Vehicles"] as const) : []),
  ];
}

/** Resolves ?tab= to a real tab, falling back to Overview for anything unknown. */
export function resolveTab(raw: string | undefined, includeVehicles: boolean, includeAccount: boolean): Tab {
  return tabsFor(includeVehicles, includeAccount).find((candidate) => toTabSlug(candidate) === raw?.toLowerCase()) ?? "Overview";
}
