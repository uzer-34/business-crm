"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  changeEmployeeRoleAction,
  suspendEmployeeAction,
  reactivateEmployeeAction,
  changeEmployeeBranchesAction,
  removeEmployeeAction,
} from "@/lib/employees/employee-actions";

type RoleOption = { key: string; name: string };
type BranchOption = { id: string; name: string };

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
  allBranches,
  branchOptions,
  assignedBranchIds,
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
  allBranches: boolean;
  branchOptions: BranchOption[];
  assignedBranchIds: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingBranches, setEditingBranches] = useState(false);
  const [allBranchesDraft, setAllBranchesDraft] = useState(allBranches);
  const [branchIdsDraft, setBranchIdsDraft] = useState<string[]>(assignedBranchIds);

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

          {canManage && (
            <Button size="sm" variant="secondary" onClick={() => setEditingBranches((v) => !v)}>
              Branches
            </Button>
          )}

          {canManage && !isSelf && (
            <Button
              size="sm"
              variant="danger"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`Remove ${name} from this organization? This cannot be undone.`)) return;
                setError(null);
                startTransition(async () => {
                  const result = await removeEmployeeAction(membershipId);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              Remove
            </Button>
          )}
        </div>

        {editingBranches && (
          <div className="flex w-full flex-col gap-2 border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allBranchesDraft}
                onChange={(e) => setAllBranchesDraft(e.target.checked)}
              />
              All branches
            </label>
            {!allBranchesDraft && (
              <div className="flex flex-wrap gap-3">
                {branchOptions.map((b) => (
                  <label key={b.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={branchIdsDraft.includes(b.id)}
                      onChange={(e) =>
                        setBranchIdsDraft((prev) =>
                          e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                        )
                      }
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await changeEmployeeBranchesAction(membershipId, {
                      allBranches: allBranchesDraft,
                      branchIds: branchIdsDraft,
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setEditingBranches(false);
                    router.refresh();
                  });
                }}
              >
                {isPending ? "Saving…" : "Save branches"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditingBranches(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && <p className="w-full text-sm text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}
