"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteEmployeeAction } from "@/lib/employees/employee-actions";

type RoleOption = { key: string; name: string };

export function InviteEmployeeForm({
  organizationId,
  branches,
  roleOptions,
}: {
  organizationId: string;
  branches: { id: string; name: string }[];
  roleOptions: RoleOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"EMAIL" | "PHONE">("EMAIL");
  const [target, setTarget] = useState("");
  const [roleKey, setRoleKey] = useState(roleOptions.find((r) => r.key === "employee")?.key ?? roleOptions[0]?.key ?? "");
  const [allBranches, setAllBranches] = useState(false);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Invite employee</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setSuccess(null);
          startTransition(async () => {
            const result = await inviteEmployeeAction(organizationId, {
              identifier: { channel, target },
              roleKey,
              allBranches,
              branchIds: allBranches ? [] : branchIds,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setSuccess(
              `Invited. They'll join automatically the next time they sign in at /login with this ${channel === "EMAIL" ? "email" : "phone number"}.`,
            );
            setTarget("");
            router.refresh();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Invite employee</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-channel">Contact via</Label>
          <select
            id="invite-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as "EMAIL" | "PHONE")}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          >
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-target">{channel === "EMAIL" ? "Email address" : "Phone number"}</Label>
          <Input
            id="invite-target"
            type={channel === "EMAIL" ? "email" : "tel"}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={channel === "EMAIL" ? "name@example.com" : "+14155552671"}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm"
          >
            {roleOptions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} />
            All branches
          </label>
          {!allBranches && (
            <div className="flex flex-col gap-1 rounded-md border border-border p-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={branchIds.includes(b.id)}
                    onChange={(e) =>
                      setBranchIds((prev) => (e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)))
                    }
                  />
                  {b.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {success && <p className="text-sm text-success">{success}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button type="submit" disabled={isPending || !target || !roleKey}>
            {isPending ? "Inviting…" : "Send invite"}
          </Button>
        </div>
      </form>
    </div>
  );
}
