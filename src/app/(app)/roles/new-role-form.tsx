"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomRoleAction } from "@/lib/rbac/role-actions";
import { PermissionChecklist } from "./permission-checklist";

type PermissionOption = { key: string; category: string; description: string };

export function NewRoleForm({
  organizationId,
  permissionOptions,
}: {
  organizationId: string;
  permissionOptions: PermissionOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Create role</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createCustomRoleAction(organizationId, { key, name, permissionKeys });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOpen(false);
            setKey("");
            setName("");
            setPermissionKeys([]);
            router.refresh();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Create custom role</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-name">Display name</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cashier" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-key">Key</Label>
            <Input
              id="role-key"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              placeholder="cashier"
              required
            />
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto rounded-md border border-border p-3">
          <PermissionChecklist options={permissionOptions} selected={permissionKeys} onChange={setPermissionKeys} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name || !key}>
            {isPending ? "Creating…" : "Create role"}
          </Button>
        </div>
      </form>
    </div>
  );
}
