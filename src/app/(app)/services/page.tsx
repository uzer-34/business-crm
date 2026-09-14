import Link from "next/link";
import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { HoverLift } from "@/components/motion/hover-lift";
import { formatMoney } from "@/lib/format";
import { NewServiceForm } from "./new-service-form";

export default async function ServicesPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const { organization } = membership;

  const [services, categories] = await Promise.all([
    db.service.findMany({
      where: { organizationId: organization.id, archivedAt: null },
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.category.findMany({
      where: { organizationId: organization.id, kind: "SERVICE", archivedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="text-sm text-muted-foreground">{services.length} total</p>
        </div>
        <NewServiceForm organizationId={organization.id} categoryNames={categories.map((c) => c.name)} />
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No services yet. Add your first one to start building a catalog.
          </CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-3">
          {services.map((service) => (
            <Link key={service.id} href={`/services/${service.id}`}>
              <HoverLift>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {service.category?.name}
                        {service.durationMinutes && `${service.category ? " · " : ""}${service.durationMinutes} min`}
                      </p>
                    </div>
                    <p className="font-medium tabular-nums">
                      {formatMoney(service.price.toString(), organization.currencyCode, organization.locale)}
                    </p>
                  </CardContent>
                </Card>
              </HoverLift>
            </Link>
          ))}
        </RevealOnScroll>
      )}
    </div>
  );
}
