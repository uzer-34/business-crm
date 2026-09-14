import Link from "next/link";
import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { HoverLift } from "@/components/motion/hover-lift";
import { NewSupplierForm } from "./new-supplier-form";

export default async function SuppliersPage() {
  const { membership } = await getDefaultMembershipOrRedirect();

  const suppliers = await db.supplier.findMany({
    where: { organizationId: membership.organizationId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} total</p>
        </div>
        <NewSupplierForm organizationId={membership.organizationId} />
      </div>

      {suppliers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No suppliers yet. Add one before creating a purchase order.
          </CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-3">
          {suppliers.map((supplier) => (
            <Link key={supplier.id} href={`/suppliers/${supplier.id}`}>
              <HoverLift>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{supplier.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {[supplier.contactName, supplier.email, supplier.phone].filter(Boolean).join(" · ") ||
                          "No contact info"}
                      </p>
                    </div>
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
