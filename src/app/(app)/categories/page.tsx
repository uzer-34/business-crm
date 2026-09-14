import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryRow } from "./category-row";

export default async function CategoriesPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const user = await getCurrentUser();
  const ctx = user ? await loadTenantContext(user.id, membership.organizationId) : null;
  if (!ctx) return null;

  const categories = await db.category.findMany({
    where: { organizationId: membership.organizationId, archivedAt: null },
    orderBy: { name: "asc" },
  });

  const sections: { kind: "PRODUCT" | "SERVICE" | "EXPENSE"; title: string; canManage: boolean }[] = [
    { kind: "PRODUCT", title: "Product categories", canManage: ctx.permissions.has("products.edit") },
    { kind: "SERVICE", title: "Service categories", canManage: ctx.permissions.has("services.edit") },
    { kind: "EXPENSE", title: "Expense categories", canManage: ctx.permissions.has("expenses.void") },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Categories are also created inline when adding a product, service, or expense — this is where to rename or
          archive them afterward.
        </p>
      </div>

      {sections.map((section) => {
        const rows = categories.filter((c) => c.kind === section.kind);
        return (
          <Card key={section.kind}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                rows.map((c) => <CategoryRow key={c.id} categoryId={c.id} name={c.name} canManage={section.canManage} />)
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
