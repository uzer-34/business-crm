import Link from "next/link";
import { ArrowRight, FolderTree, SlidersHorizontal } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { INDUSTRIES } from "@/lib/industry/registry";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/layout";
import { IndustryForm } from "./industry-form";

export default async function SettingsPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const user = await getCurrentUser();
  const ctx = user ? await loadTenantContext(user.id, membership.organizationId) : null;
  if (!ctx) return null;

  if (!ctx.permissions.has("organization.manage")) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-[13px] text-foreground-muted">
          You don&apos;t have permission to view business settings.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Settings" description={membership.organization.name} />

      <Card>
        <CardHeader>
          <CardTitle>Industry</CardTitle>
          <CardDescription>
            Changes how some pages refer to your customers and orders — an automobile workshop calls an order a
            &quot;Job Card&quot;. Doesn&apos;t change any data, only labels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IndustryForm
            organizationId={membership.organizationId}
            currentIndustryKey={membership.organization.industryKey}
            industries={INDUSTRIES.map((industry) => ({ key: industry.key, label: industry.label }))}
          />
        </CardContent>
      </Card>

      <SettingsLink
        href="/settings/attributes"
        icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
        title="Attributes"
        description="Decide what information you capture on customers, products, services and vehicles."
      />

      <SettingsLink
        href="/settings/categories"
        icon={<FolderTree className="size-4" aria-hidden="true" />}
        title="Categories"
        description="Organise your catalog, and choose which attributes each category suggests."
      />
    </div>
  );
}

function SettingsLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-hover">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-foreground-muted">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-[13px] text-foreground-muted">{description}</p>
        </div>
        <ArrowRight className="mt-1 size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
      </div>
    </Link>
  );
}
