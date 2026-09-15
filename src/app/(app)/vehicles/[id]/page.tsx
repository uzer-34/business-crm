import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext } from "@/lib/rbac/guard";
import { getTerminology } from "@/lib/industry/terminology";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { ArchiveVehicleButton } from "./archive-vehicle-button";
import { EditVehicleForm } from "./edit-vehicle-form";
import { loadFieldLayout, loadFieldValues } from "@/lib/metadata/field-service";
import { VehicleAttributes } from "./vehicle-attributes";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PARTIALLY_FULFILLED: "Partially fulfilled",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

export default async function VehiclePage({ params }: PageProps<"/vehicles/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const vehicle = await db.vehicle.findUnique({ where: { id }, include: { customer: true, organization: true } });
  if (!vehicle) notFound();

  const ctx = await loadTenantContext(user.id, vehicle.organizationId);
  if (!ctx || !ctx.permissions.has("vehicles.view")) notFound();

  const term = getTerminology(vehicle.organization.industryKey);

  const [serviceHistory, fieldSections, fieldValues] = await Promise.all([
    db.order.findMany({ where: { vehicleId: id }, orderBy: { createdAt: "desc" } }),
    loadFieldLayout(ctx.organizationId, "vehicle", { roleKey: ctx.roleKey }),
    loadFieldValues(ctx.organizationId, "vehicle", id),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-semibold">
              {vehicle.make} {vehicle.model}
              {vehicle.year && ` (${vehicle.year})`}
            </h1>
            <p className="text-sm text-muted-foreground">
              <Link href={`/customers/${vehicle.customerId}`} className="hover:underline">
                {vehicle.customer.name}
              </Link>
              {vehicle.plateNumber && ` · ${vehicle.plateNumber}`}
              {vehicle.vin && ` · VIN ${vehicle.vin}`}
            </p>
          </div>
          <div className="flex gap-2">
            {ctx.permissions.has("vehicles.edit") && (
              <EditVehicleForm
                vehicleId={vehicle.id}
                initial={{
                  make: vehicle.make,
                  model: vehicle.model,
                  year: vehicle.year,
                  plateNumber: vehicle.plateNumber,
                  vin: vehicle.vin,
                }}
              />
            )}
            {ctx.permissions.has("vehicles.archive") && <ArchiveVehicleButton vehicleId={vehicle.id} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service history</CardTitle>
        </CardHeader>
        <CardContent>
          {serviceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {term.orders.toLowerCase()} for this vehicle yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {serviceHistory.map((order) => (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <Card>
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {STATUS_LABEL[order.status]}
                          {order.odometerReading != null && ` · ${order.odometerReading} mi/km`} ·{" "}
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-sm font-medium tabular-nums">
                        {formatMoney(order.total.toString(), vehicle.organization.currencyCode, vehicle.organization.locale)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <VehicleAttributes
        vehicleId={vehicle.id}
        organizationId={ctx.organizationId}
        sections={fieldSections}
        initialValues={fieldValues}
        canConfigure={ctx.permissions.has("organization.manage")}
        canEdit={ctx.permissions.has("vehicles.edit")}
      />

    </div>
  );
}
