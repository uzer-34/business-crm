import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { getTerminology } from "@/lib/industry/terminology";
import { PageHeader } from "@/components/ui/layout";
import { Card, CardContent } from "@/components/ui/card";
import { describeListView } from "@/lib/list-view/query";
import { getCustomerList, parseCustomerListQuery, CUSTOMER_LIST_CONFIG } from "@/lib/customer/customer-list";
import type { FilterDefinition } from "@/components/data-table/filter-bar";
import { CustomersTable } from "./customers-table";
import { NewCustomerForm } from "./new-customer-form";

const SORT_LABELS: Record<string, string> = {
  name: "Name",
  status: "Status",
  createdAt: "Created",
};

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const ctx = await loadTenantContext(user.id, membership.organizationId);

  const term = getTerminology(membership.organization.industryKey);

  if (!ctx || !ctx.permissions.has("customers.view")) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-[13px] text-foreground-muted">
          You don&apos;t have permission to view {term.customers.toLowerCase()}.
        </CardContent>
      </Card>
    );
  }

  const params = await searchParams;
  const query = parseCustomerListQuery(params);

  const [result, customFieldDefs, members, branches] = await Promise.all([
    getCustomerList(membership.organizationId, query),
    db.customFieldDefinition.findMany({
      where: { organizationId: membership.organizationId, entityType: "CUSTOMER", archivedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    db.membership.findMany({
      where: { organizationId: membership.organizationId, status: "ACTIVE" },
      include: { user: { select: { name: true, email: true, phone: true } } },
    }),
    db.branch.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const filters: FilterDefinition[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "LEAD", label: "Lead" },
        { value: "ACTIVE", label: "Active" },
        { value: "INACTIVE", label: "Inactive" },
      ],
    },
    {
      key: "type",
      label: "Type",
      options: [
        { value: "INDIVIDUAL", label: "Individual" },
        { value: "BUSINESS", label: "Business" },
      ],
    },
    {
      key: "assignedToId",
      label: "Owner",
      options: members.map((member) => ({
        value: member.id,
        label: member.user.name ?? member.user.email ?? member.user.phone ?? "Member",
      })),
    },
    // A single-branch business has nothing to filter by, so the control is
    // only offered once a second branch exists.
    ...(branches.length > 1
      ? [{ key: "branchId", label: "Branch", options: branches.map((b) => ({ value: b.id, label: b.name })) }]
      : []),
    { key: "archived", label: "Archived", options: [{ value: "true", label: "Archived only" }] },
  ];

  const summary = describeListView({
    total: result.total,
    noun: term.customer.toLowerCase(),
    pluralNoun: term.customers.toLowerCase(),
    search: query.search,
    sortLabel: SORT_LABELS[query.sort ?? CUSTOMER_LIST_CONFIG.defaultSort],
    filterLabels: filters.filter((filter) => query.filters[filter.key]).map((filter) => filter.label),
  });

  const canCreate = ctx.permissions.has("customers.create");
  const customFields = customFieldDefs.map((field) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    fieldType: field.fieldType,
    options: (field.options as string[] | null) ?? null,
    required: field.required,
  }));

  /*
   * Two independent instances: the header one honours ?new=1 (the link the
   * global create menu points at), the empty-state one never auto-opens.
   * A single shared element rendered in both slots would open two stacked
   * dialogs on that link.
   */
  const renderCreateForm = (autoOpen: boolean) =>
    canCreate ? (
      <NewCustomerForm
        organizationId={membership.organizationId}
        customerNoun={term.customer}
        defaultOpen={autoOpen}
        customFields={customFields}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={term.customers} actions={renderCreateForm(params.new === "1")} />
      <CustomersTable
        rows={result.rows}
        result={result}
        query={query}
        summary={summary}
        filters={filters}
        canEdit={ctx.permissions.has("customers.edit")}
        customerNoun={term.customers}
        createSlot={renderCreateForm(false)}
      />
    </div>
  );
}
