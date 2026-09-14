"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchOrganizationAction } from "@/lib/organization/actions";

export function OrgSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: { id: string; name: string }[];
  activeOrganizationId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={activeOrganizationId}
      disabled={isPending}
      onChange={(e) => {
        const organizationId = e.target.value;
        startTransition(async () => {
          await switchOrganizationAction(organizationId);
          router.push("/dashboard");
          router.refresh();
        });
      }}
      className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm font-semibold"
    >
      {organizations.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
