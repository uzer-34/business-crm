import Link from "next/link";
import { db } from "@/lib/db";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { getTerminology } from "@/lib/industry/terminology";
import { Card, CardContent } from "@/components/ui/card";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import { HoverLift } from "@/components/motion/hover-lift";
import { NewCustomerForm } from "./new-customer-form";

const STATUS_LABEL: Record<string, string> = {
  LEAD: "Lead",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

const STATUS_CLASS: Record<string, string> = {
  LEAD: "bg-warning/15 text-warning",
  ACTIVE: "bg-success/15 text-success",
  INACTIVE: "bg-muted text-muted-foreground",
};

export default async function CustomersPage() {
  const { membership } = await getDefaultMembershipOrRedirect();
  const term = getTerminology(membership.organization.industryKey);

  const [customers, customFieldDefs] = await Promise.all([
    db.customer.findMany({
      where: { organizationId: membership.organizationId, archivedAt: null },
      include: { assignedTo: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.customFieldDefinition.findMany({
      where: { organizationId: membership.organizationId, entityType: "CUSTOMER", archivedAt: null },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const customFields = customFieldDefs.map((f) => ({
    id: f.id,
    key: f.key,
    label: f.label,
    fieldType: f.fieldType,
    options: (f.options as string[] | null) ?? null,
    required: f.required,
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{term.customers}</h1>
          <p className="text-sm text-muted-foreground">{customers.length} total</p>
        </div>
        <NewCustomerForm organizationId={membership.organizationId} customFields={customFields} />
      </div>

      {customers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No {term.customers.toLowerCase()} yet. Add your first one to start building activity history.
          </CardContent>
        </Card>
      ) : (
        <RevealOnScroll className="flex flex-col gap-3">
          {customers.map((customer) => (
            <HoverLift key={customer.id}>
              <Link href={`/customers/${customer.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact info"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {customer.assignedTo && (
                        <span className="text-xs text-muted-foreground">
                          {customer.assignedTo.user.name ?? customer.assignedTo.user.email ?? "Assigned"}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[customer.status]}`}>
                        {STATUS_LABEL[customer.status]}
                      </span>
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
