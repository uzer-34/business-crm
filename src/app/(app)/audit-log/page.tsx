import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/layout";
import { describeListView } from "@/lib/list-view/query";
import { getAuditActions, getAuditList, parseAuditListQuery } from "@/lib/audit/audit-list";
import type { FilterDefinition } from "@/components/data-table/filter-bar";
import { AuditTable } from "./audit-table";

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const ctx = await loadTenantContext(user.id, membership.organizationId);

  // The audit trail exposes who did what across the whole business, so it is
  // restricted to the same permission that governs the organization itself.
  if (!ctx || !ctx.permissions.has("organization.manage")) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-[13px] text-foreground-muted">
          You don&apos;t have permission to view the audit log.
        </CardContent>
      </Card>
    );
  }

  const params = await searchParams;
  const query = parseAuditListQuery(params);

  const [result, actions, members] = await Promise.all([
    getAuditList(membership.organizationId, query),
    getAuditActions(membership.organizationId),
    db.membership.findMany({
      where: { organizationId: membership.organizationId },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    }),
  ]);

  const filters: FilterDefinition[] = [
    { key: "action", label: "Event", options: actions.map((action) => ({ value: action, label: action })) },
    {
      key: "actorUserId",
      label: "Who",
      options: members.map((member) => ({
        value: member.user.id,
        label: member.user.name ?? member.user.email ?? member.user.phone ?? "Member",
      })),
    },
  ];

  const summary = describeListView({
    total: result.total,
    noun: "event",
    pluralNoun: "events",
    search: query.search,
    sortLabel: "When",
    filterLabels: filters.filter((filter) => query.filters[filter.key]).map((filter) => filter.label),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Audit log"
        description="Every sign-in, permission change, configuration edit and record change in this business."
      />
      <AuditTable rows={result.rows} result={result} query={query} summary={summary} filters={filters} />
    </div>
  );
}
