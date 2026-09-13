import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { Card, CardContent } from "@/components/ui/card";
import { NewBranchForm } from "./new-branch-form";

export default async function BranchesPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const canManage = membership.allBranches; // Owner/Manager seed with allBranches=true.

  const branches = await db.branch.findMany({
    where: { organizationId: membership.organizationId, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Branches</h1>
          <p className="text-sm text-muted-foreground">Locations under {membership.organization.name}.</p>
        </div>
        {canManage && (
          <NewBranchForm organizationId={membership.organizationId} defaultCountryCode={membership.organization.countryCode} />
        )}
      </div>

      <div className="flex flex-col gap-3">
        {branches.map((branch) => (
          <Card key={branch.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">
                  {branch.name}
                  {branch.isDefault && (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      Default
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[branch.city, branch.countryCode].filter(Boolean).join(", ")}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
