import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { INDUSTRIES } from "@/lib/industry/registry";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IndustryForm } from "./industry-form";
import { CustomFieldForm } from "./custom-field-form";
import { ArchiveFieldButton } from "./archive-field-button";

const FIELD_TYPE_LABEL: Record<string, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Yes/No",
  SELECT: "Dropdown",
};

export default async function SettingsPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const user = await getCurrentUser();
  const ctx = user ? await loadTenantContext(user.id, membership.organizationId) : null;
  if (!ctx) return null;

  const canManage = ctx.permissions.has("organization.manage");

  if (!canManage) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          You don&apos;t have permission to view organization settings.
        </CardContent>
      </Card>
    );
  }

  const customerFields = await db.customFieldDefinition.findMany({
    where: { organizationId: membership.organizationId, entityType: "CUSTOMER", archivedAt: null },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">{membership.organization.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Industry</CardTitle>
          <CardDescription>
            Changes how some pages refer to your customers and orders — e.g. an automobile workshop calls an order a
            &quot;Job Card&quot;. Doesn&apos;t change any data, only labels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IndustryForm
            organizationId={membership.organizationId}
            currentIndustryKey={membership.organization.industryKey}
            industries={INDUSTRIES.map((i) => ({ key: i.key, label: i.label }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom fields — Customers</CardTitle>
          <CardDescription>
            Track anything specific to your business on every customer record (e.g. a vehicle plate number, an
            allergy list, a membership tier).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {customerFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No custom fields yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {customerFields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    {field.label}
                    <span className="text-muted-foreground">
                      {" "}
                      · {FIELD_TYPE_LABEL[field.fieldType]}
                      {field.required && " · required"}
                    </span>
                  </span>
                  <ArchiveFieldButton definitionId={field.id} />
                </div>
              ))}
            </div>
          )}
          <CustomFieldForm organizationId={membership.organizationId} />
        </CardContent>
      </Card>
    </div>
  );
}
