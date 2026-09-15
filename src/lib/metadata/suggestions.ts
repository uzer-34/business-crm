"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveOrganizationId } from "@/lib/organization/active-org";
import { loadTenantContext } from "@/lib/rbac/guard";
import { getCountryOptions, getCurrencyOptions, getTimezoneOptions } from "@/lib/reference/locale-data";

/*
 * Suggestion providers.
 *
 * The UI asks a provider id for options and never knows where they came from —
 * bundled reference data, the organization's own records, or a field's stored
 * option list. That indirection is the point: swapping in an external dataset
 * later means adding a provider, not changing a single control.
 *
 * Every provider resolves the caller's organization from the session, so an
 * organization-scoped provider can only ever return that organization's rows.
 */

export interface SuggestionOption {
  value: string;
  label: string;
  hint?: string;
}

export type SuggestionProviderId =
  | "reference.country"
  | "reference.currency"
  | "reference.timezone"
  | "organization.branch"
  | "organization.member"
  | "organization.category"
  | "organization.supplier"
  | "field.options";

export interface SuggestionRequest {
  providerId: SuggestionProviderId;
  query?: string;
  /** Provider-specific scope, e.g. a field id or a parent category id. */
  scopeId?: string;
}

function filterAndCap(options: SuggestionOption[], query: string | undefined, limit = 50): SuggestionOption[] {
  const needle = (query ?? "").trim().toLowerCase();
  const matched = needle
    ? options.filter(
        (option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle),
      )
    : options;
  return matched.slice(0, limit);
}

/**
 * Single entry point for the client. Returns an empty list rather than
 * throwing when the caller has no organization or the provider is unknown —
 * a suggestion list is an aid, and failing it should never break a form.
 */
export async function fetchSuggestions(request: SuggestionRequest): Promise<SuggestionOption[]> {
  const { providerId, query, scopeId } = request;

  // Reference providers carry no tenant data, so they answer without a session.
  if (providerId === "reference.country") {
    return filterAndCap(getCountryOptions().map(({ value, label, hint }) => ({ value, label, hint })), query);
  }
  if (providerId === "reference.currency") {
    return filterAndCap(getCurrencyOptions().map(({ value, label, hint }) => ({ value, label, hint })), query);
  }
  if (providerId === "reference.timezone") {
    return filterAndCap(getTimezoneOptions().map(({ value, label }) => ({ value, label })), query);
  }

  const user = await getCurrentUser();
  if (!user) return [];

  const organizationId = await getActiveOrganizationId(user.id);
  if (!organizationId) return [];

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return [];

  if (providerId === "organization.branch") {
    const branches = await db.branch.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, name: true, city: true },
      orderBy: { name: "asc" },
    });
    return filterAndCap(
      branches.map((branch) => ({ value: branch.id, label: branch.name, hint: branch.city ?? undefined })),
      query,
    );
  }

  if (providerId === "organization.member") {
    const members = await db.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { user: { select: { name: true, email: true, phone: true } } },
    });
    return filterAndCap(
      members.map((member) => ({
        value: member.id,
        label: member.user.name ?? member.user.email ?? member.user.phone ?? "Member",
      })),
      query,
    );
  }

  if (providerId === "organization.supplier") {
    if (!ctx.permissions.has("suppliers.view")) return [];
    const suppliers = await db.supplier.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return filterAndCap(suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })), query);
  }

  if (providerId === "organization.category") {
    // scopeId narrows to children of a parent — the Category -> Subcategory
    // cascade, served by the same interface as every other suggestion.
    const categories = await db.category.findMany({
      where: {
        organizationId,
        archivedAt: null,
        ...(scopeId ? { parentId: scopeId } : {}),
      },
      select: { id: true, name: true, depth: true },
      orderBy: [{ depth: "asc" }, { name: "asc" }],
    });
    return filterAndCap(categories.map((category) => ({ value: category.id, label: category.name })), query);
  }

  if (providerId === "field.options") {
    if (!scopeId) return [];
    // Joining through the definition keeps this tenant-safe: a field id from
    // another organization matches nothing.
    const options = await db.fieldOption.findMany({
      where: { fieldDefinitionId: scopeId, isActive: true, fieldDefinition: { organizationId } },
      orderBy: { displayOrder: "asc" },
      select: { value: true, label: true },
    });
    return filterAndCap(options, query, 200);
  }

  return [];
}
