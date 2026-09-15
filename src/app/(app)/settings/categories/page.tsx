import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/layout";
import { loadCategoryTree, loadRecommendations } from "@/lib/metadata/category-service";
import { ATTRIBUTE_TEMPLATES } from "@/lib/metadata/attribute-library";
import { CategoryManager } from "./category-manager";

const KINDS = ["PRODUCT", "SERVICE", "EXPENSE"] as const;

export default async function CategoriesPage({ searchParams }: PageProps<"/settings/categories"> ) {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const currentUser = await getCurrentUser();
  const ctx = currentUser ? await loadTenantContext(user.id, membership.organizationId) : null;

  if (!ctx || !ctx.permissions.has("organization.manage")) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-[13px] text-foreground-muted">
          You don&apos;t have permission to configure categories.
        </CardContent>
      </Card>
    );
  }

  const params = await searchParams;
  const requestedKind = typeof params.kind === "string" ? params.kind.toUpperCase() : "";
  const kind = (KINDS as readonly string[]).includes(requestedKind)
    ? (requestedKind as (typeof KINDS)[number])
    : "PRODUCT";

  const selectedId = typeof params.category === "string" ? params.category : null;

  const tree = await loadCategoryTree(membership.organizationId, kind);
  const selected = selectedId ? tree.find((node) => node.id === selectedId) : null;

  // The entity a category's recommendations apply to follows the category kind.
  const entityKey = kind === "SERVICE" ? "service" : "product";
  const recommendations = selected
    ? await loadRecommendations(membership.organizationId, selected.id, entityKey)
    : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Categories"
        description="Organise your catalog, and choose which attributes each category suggests."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Categories" }]}
      />

      <CategoryManager
        organizationId={membership.organizationId}
        kind={kind}
        kinds={KINDS.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))}
        nodes={tree}
        selected={selected ?? null}
        entityKey={entityKey}
        recommendations={recommendations}
        availableTemplates={ATTRIBUTE_TEMPLATES.map((template) => ({
          key: template.key,
          label: template.label,
        }))}
      />
    </div>
  );
}
