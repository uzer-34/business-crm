import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent } from "@/components/ui/card";
import { InviteEmployeeForm } from "./invite-employee-form";
import { EmployeeRow } from "./employee-row";

const STATUS_LABEL: Record<string, string> = { INVITED: "Invited", ACTIVE: "Active", SUSPENDED: "Suspended" };

export default async function EmployeesPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const user = await getCurrentUser();
  const ctx = user ? await loadTenantContext(user.id, membership.organizationId) : null;
  if (!ctx) return null;

  const [memberships, branches, roles] = await Promise.all([
    db.membership.findMany({
      where: { organizationId: membership.organizationId },
      include: { user: true, role: true, branches: { include: { branch: true } } },
      orderBy: [{ status: "asc" }, { invitedAt: "asc" }],
    }),
    db.branch.findMany({ where: { organizationId: membership.organizationId, archivedAt: null } }),
    db.role.findMany({ where: { organizationId: membership.organizationId }, orderBy: { name: "asc" } }),
  ]);

  const canManage = ctx.permissions.has("employees.manage");
  const isOwner = roles.find((r) => r.id === ctx.roleId)?.key === "owner";
  const roleOptions = roles
    .filter((r) => r.key !== "owner" || isOwner)
    .map((r) => ({ key: r.key, name: r.name }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">{memberships.length} total</p>
        </div>
        {canManage && (
          <InviteEmployeeForm
            organizationId={membership.organizationId}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
            roleOptions={roleOptions}
          />
        )}
      </div>

      {!canManage && !ctx.permissions.has("employees.view") ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            You don&apos;t have permission to view employees.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {memberships.map((m) => (
            <EmployeeRow
              key={m.id}
              membershipId={m.id}
              isSelf={m.id === ctx.membershipId}
              name={m.user.name ?? m.user.email ?? m.user.phone ?? "Unknown"}
              contact={m.user.email ?? m.user.phone ?? ""}
              roleName={m.role.name}
              roleOptions={roleOptions}
              currentRoleKey={m.role.key}
              status={m.status}
              statusLabel={STATUS_LABEL[m.status]}
              branchNames={m.allBranches ? ["All branches"] : m.branches.map((b) => b.branch.name)}
              allBranches={m.allBranches}
              branchOptions={branches.map((b) => ({ id: b.id, name: b.name }))}
              assignedBranchIds={m.branches.map((b) => b.branchId)}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}
