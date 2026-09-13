"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  changeEmployeeRoleAction,
  suspendEmployeeAction,
  reactivateEmployeeAction,
} from "@/lib/employees/employee-actions";

type RoleOption = { key: string; name: string };

export function EmployeeRow({
  membershipId,
  isSelf,
  name,
  contact,
  roleName,
  roleOptions,
  currentRoleKey,
  status,
  statusLabel,
  branchNames,
  canManage,
}: {
  membershipId: string;
  isSelf: boolean;
  name: string;
  contact: string;
  roleName: string;
  roleOptions: RoleOption[];
  currentRoleKey: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  statusLabel: string;
  branchNames: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">
            {name}
            {isSelf && <span className="text-muted-foreground"> (you)</span>}
          </p>
          <p className="text-sm text-muted-foreground">
            {contact} · {branchNames.join(", ") || "No branches"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              status === "SUSPENDED" ? "bg-danger/10 text-danger" : "bg-accent text-accent-foreground"
            }`}
          >
            {statusLabel}
          </span>

          {canManage && !isSelf ? (
            <select
              value={currentRoleKey}
              disabled={isPending}
              onChange={(e) => {
                setError(null);
                startTransition(async () => {
                  const result = await changeEmployeeRoleAction(membershipId, { roleKey: e.target.value });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
              className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            >
              {roleOptions.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-muted-foreground">{roleName}</span>
          )}

          {canManage && !isSelf && status === "ACTIVE" && (
            <Button
              size="sm"
              variant="danger"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await suspendEmployeeAction(membershipId);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              Suspend
            </Button>
          )}
          {canManage && !isSelf && status === "SUSPENDED" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await reactivateEmployeeAction(membershipId);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              Reactivate
            </Button>
          )}
        </div>
        {error && <p className="w-full text-sm text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}
