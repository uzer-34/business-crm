import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { loadTenantContext } from "@/lib/rbac/guard";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { HoverLift } from "@/components/motion/hover-lift";
import { NewVehicleForm } from "./new-vehicle-form";

export default async function VehiclesPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const user = await getCurrentUser();
  const ctx = user ? await loadTenantContext(user.id, membership.organizationId) : null;
  if (!ctx) return null;

  if (!ctx.permissions.has("vehicles.view")) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          You don&apos;t have permission to view vehicles.
        </CardContent>
      </Card>
    );
  }

  const [vehicles, customers] = await Promise.all([
    db.vehicle.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.customer.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  const canCreate = ctx.permissions.has("vehicles.create");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
          <p className="text-sm text-muted-foreground">{vehicles.length} total</p>
        </div>
        {canCreate && <NewVehicleForm customers={customers.map((c) => ({ id: c.id, name: c.name }))} />}
      </div>

      {vehicles.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">No vehicles yet.</CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-3">
          {vehicles.map((vehicle) => (
            <HoverLift key={vehicle.id}>
              <Link href={`/vehicles/${vehicle.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">
                        {vehicle.make} {vehicle.model}
                        {vehicle.year && ` (${vehicle.year})`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {vehicle.customer.name}
                        {vehicle.plateNumber && ` · ${vehicle.plateNumber}`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </HoverLift>
          ))}
        </RevealOnScroll>
      )}
    </div>
  );
}
