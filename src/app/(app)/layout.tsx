import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect, switchOrganizationAction } from "@/lib/organization/actions";
import { logoutAction } from "@/lib/auth/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { AppShell } from "@/components/shell/app-shell";
import { NotificationBell } from "./notification-bell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, membership, memberships } = await getDefaultMembershipOrRedirect();

  const ctx = await loadTenantContext(user.id, membership.organizationId);
  const permissions = ctx ? Array.from(ctx.permissions) : [];

  const [notificationRows, branch] = await Promise.all([
    db.notification.findMany({
      where: { membershipId: membership.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    // A member scoped to exactly one branch sees it as standing context in the
    // shell; anyone with wider access picks a branch per screen instead.
    membership.allBranches
      ? Promise.resolve(null)
      : db.membershipBranch.findFirst({
          where: { membershipId: membership.id },
          include: { branch: { select: { name: true } } },
        }),
  ]);

  const notifications = notificationRows.map((n) => ({
    id: n.id,
    message: n.message,
    linkPath: n.linkPath,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));

  async function switchOrganization(organizationId: string) {
    "use server";
    await switchOrganizationAction(organizationId);
  }

  return (
    <AppShell
      user={{ name: user.name, email: user.email, phone: user.phone }}
      organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organization.name }))}
      activeOrganizationId={membership.organizationId}
      roleName={membership.role.name}
      branchName={branch?.branch.name ?? null}
      permissions={permissions}
      industryKey={membership.organization.industryKey}
      onSwitchOrganization={switchOrganization}
      onSignOut={logoutAction}
      notificationSlot={<NotificationBell membershipId={membership.id} notifications={notifications} />}
    >
      {children}
    </AppShell>
  );
}
