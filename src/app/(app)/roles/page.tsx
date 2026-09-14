import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { PERMISSION_CATALOG } from "@/lib/rbac/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { NewRoleForm } from "./new-role-form";
import { RoleCard } from "./role-card";

export default async function RolesPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const user = await getCurrentUser();
  const ctx = user ? await loadTenantContext(user.id, membership.organizationId) : null;
  if (!ctx) return null;

  if (!ctx.permissions.has("roles.manage")) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            You don&apos;t have permission to manage roles.
          </CardContent>
        </Card>
      </div>
    );
  }

  const roles = await db.role.findMany({
    where: { organizationId: membership.organizationId },
    include: { permissions: { include: { permission: true } }, _count: { select: { memberships: true } } },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
  });

  const permissionOptions = PERMISSION_CATALOG.map((p) => ({
    key: p.key,
    category: p.category,
    description: p.description,
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
          <p className="text-sm text-muted-foreground">{roles.length} total</p>
        </div>
        <NewRoleForm organizationId={membership.organizationId} permissionOptions={permissionOptions} />
      </div>

      <div className="flex flex-col gap-3">
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            roleId={role.id}
            roleKey={role.key}
            name={role.name}
            isSystem={role.isSystem}
            memberCount={role._count.memberships}
            currentPermissionKeys={role.permissions.map((rp) => rp.permission.key)}
            permissionOptions={permissionOptions}
          />
        ))}
      </div>
    </div>
  );
}
