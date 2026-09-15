import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/layout";
import { ENTITY_DEFINITIONS, getEntityDefinition } from "@/lib/metadata/entities";
import { loadFields } from "@/lib/metadata/field-service";
import { AttributeManager } from "./attribute-manager";

export default async function AttributesPage({ searchParams }: PageProps<"/settings/attributes">) {
  const { user, membership } = await getDefaultMembershipOrRedirect();
  const currentUser = await getCurrentUser();
  const ctx = currentUser ? await loadTenantContext(user.id, membership.organizationId) : null;

  if (!ctx || !ctx.permissions.has("organization.manage")) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-[13px] text-foreground-muted">
          You don&apos;t have permission to configure attributes.
        </CardContent>
      </Card>
    );
  }

  const params = await searchParams;
  const requested = typeof params.entity === "string" ? params.entity : "";
  const entity = getEntityDefinition(requested) ?? ENTITY_DEFINITIONS[0];

  // includeHidden so the configuration screen shows fields that forms hide.
  const [fields, sections, categories, roles] = await Promise.all([
    loadFields(membership.organizationId, entity.key, { includeHidden: true }),
    db.fieldSection.findMany({
      where: { organizationId: membership.organizationId, entityKey: entity.key, archivedAt: null },
      orderBy: { displayOrder: "asc" },
      select: { id: true, label: true },
    }),
    entity.supportsCategories
      ? db.category.findMany({
          where: { organizationId: membership.organizationId, archivedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    db.role.findMany({
      where: { organizationId: membership.organizationId },
      select: { key: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Attributes"
        description="Choose what information your team captures on each kind of record."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Attributes" }]}
      />

      <AttributeManager
        organizationId={membership.organizationId}
        entities={ENTITY_DEFINITIONS.map((definition) => ({
          key: definition.key,
          label: definition.label,
          pluralLabel: definition.pluralLabel,
          description: definition.description,
          supportsCategories: definition.supportsCategories,
        }))}
        activeEntityKey={entity.key}
        fields={fields.map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          description: field.description,
          dataType: field.dataType,
          source: field.source,
          isRequired: field.isRequired,
          hidden: field.hidden,
          sectionId: field.sectionId,
          options: field.options,
          categoryIds: field.categoryIds,
          roleKeys: field.roleKeys,
        }))}
        sections={sections}
        categories={categories}
        roles={roles}
      />
    </div>
  );
}
