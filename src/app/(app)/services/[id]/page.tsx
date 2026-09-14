import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { EditServiceForm } from "./edit-service-form";
import { ArchiveServiceButton } from "./archive-service-button";

export default async function ServicePage({ params }: PageProps<"/services/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const service = await db.service.findUnique({ where: { id }, include: { category: true, organization: true } });
  if (!service) notFound();

  const ctx = await loadTenantContext(user.id, service.organizationId);
  if (!ctx) notFound();

  const { organization } = service;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-semibold">{service.name}</h1>
            <p className="text-sm text-muted-foreground">
              {service.category?.name}
              {service.durationMinutes && `${service.category ? " · " : ""}${service.durationMinutes} min`}
            </p>
            {service.description && <p className="mt-2 text-sm">{service.description}</p>}
          </div>
          <div className="flex items-start gap-4">
            <p className="font-semibold tabular-nums">
              {formatMoney(service.price.toString(), organization.currencyCode, organization.locale)}
            </p>
            <div className="flex gap-2">
              {ctx.permissions.has("services.edit") && (
                <EditServiceForm
                  serviceId={service.id}
                  initial={{
                    name: service.name,
                    price: service.price.toString(),
                    durationMinutes: service.durationMinutes,
                    taxRatePercent: service.taxRatePercent.toString(),
                    categoryName: service.category?.name ?? "",
                  }}
                />
              )}
              {ctx.permissions.has("services.archive") && <ArchiveServiceButton serviceId={service.id} />}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
