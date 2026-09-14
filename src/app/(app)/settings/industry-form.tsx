"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { changeIndustryAction } from "@/lib/organization/actions";

export function IndustryForm({
  organizationId,
  currentIndustryKey,
  industries,
}: {
  organizationId: string;
  currentIndustryKey: string;
  industries: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [industryKey, setIndustryKey] = useState(currentIndustryKey);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          const result = await changeIndustryAction(organizationId, { industryKey });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSuccess(true);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="industry-select" className="text-sm font-medium">
          Industry
        </label>
        <select
          id="industry-select"
          value={industryKey}
          onChange={(e) => setIndustryKey(e.target.value)}
          className="h-10 min-w-64 rounded-md border border-border bg-card px-3 text-sm"
        >
          {industries.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={isPending || industryKey === currentIndustryKey}>
        {isPending ? "Saving…" : "Save"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-success">Saved. Labels update across the app immediately.</p>}
    </form>
  );
}
