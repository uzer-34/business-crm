"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { renameRoleAction, updateRolePermissionsAction, deleteCustomRoleAction } from "@/lib/rbac/role-actions";
import { PermissionChecklist } from "./permission-checklist";

type PermissionOption = { key: string; category: string; description: string };

export function RoleCard({
  roleId,
  roleKey,
  name,
  isSystem,
  memberCount,
  currentPermissionKeys,
  permissionOptions,
}: {
  roleId: string;
  roleKey: string;
  name: string;
  isSystem: boolean;
  memberCount: number;
  currentPermissionKeys: string[];
  permissionOptions: PermissionOption[];
}) {
  const router = useRouter();
  const [editingPermissions, setEditingPermissions] = useState(false);
  const [permissionKeys, setPermissionKeys] = useState(currentPermissionKeys);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOwnerRole = roleKey === "owner";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {renaming ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  startTransition(async () => {
                    const result = await renameRoleAction(roleId, { name: nameDraft });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setRenaming(false);
                    router.refresh();
                  });
                }}
              >
                <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-8" autoFocus />
                <Button type="submit" size="sm" disabled={isPending || !nameDraft.trim()}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setRenaming(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <p className="font-medium">
                {name} {isSystem && <span className="text-xs text-muted-foreground">(system)</span>}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {roleKey} · {memberCount} member{memberCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2">
            {!renaming && (
              <Button size="sm" variant="secondary" onClick={() => setRenaming(true)}>
                Rename
              </Button>
            )}
            {!isOwnerRole && (
              <Button size="sm" variant="secondary" onClick={() => setEditingPermissions((v) => !v)}>
                {editingPermissions ? "Hide permissions" : "Edit permissions"}
              </Button>
            )}
            {!isSystem && memberCount === 0 && (
              <Button
                size="sm"
                variant="danger"
                disabled={isPending}
                onClick={() => {
                  if (!window.confirm(`Delete the "${name}" role? This cannot be undone.`)) return;
                  startTransition(async () => {
                    const result = await deleteCustomRoleAction(roleId);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        {isOwnerRole && <p className="text-xs text-muted-foreground">The Owner role always keeps every permission.</p>}

        {editingPermissions && !isOwnerRole && (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <div className="max-h-96 overflow-y-auto rounded-md border border-border p-3">
              <PermissionChecklist options={permissionOptions} selected={permissionKeys} onChange={setPermissionKeys} />
            </div>
            <Button
              size="sm"
              className="self-start"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await updateRolePermissionsAction(roleId, { permissionKeys });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setEditingPermissions(false);
                  router.refresh();
                });
              }}
            >
              {isPending ? "Saving…" : "Save permissions"}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}
