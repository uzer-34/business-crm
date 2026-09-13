"use client";

import { useRouter } from "next/navigation";

export function BranchSwitcher({
  branches,
  selectedBranchId,
}: {
  branches: { id: string; name: string }[];
  selectedBranchId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedBranchId}
      onChange={(e) => router.push(`/inventory?branchId=${e.target.value}`)}
      className="h-10 rounded-md border border-border bg-card px-3 text-sm"
    >
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </select>
  );
}
