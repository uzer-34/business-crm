"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { editCategoryAction, archiveCategoryAction } from "@/lib/catalog/category-actions";

export function CategoryRow({ categoryId, name, canManage }: { categoryId: string; name: string; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        className="flex items-center gap-2 rounded-md border border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await editCategoryAction(categoryId, draft);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setEditing(false);
            router.refresh();
          });
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8" autoFocus />
        <Button type="submit" size="sm" disabled={isPending || !draft.trim()}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-border p-2 px-3">
      <span className="text-sm">{name}</span>
      {canManage && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Rename
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm(`Archive category "${name}"? Existing items keep it, but it won't be offered for new ones.`))
                return;
              startTransition(async () => {
                await archiveCategoryAction(categoryId);
                router.refresh();
              });
            }}
          >
            Archive
          </Button>
        </div>
      )}
    </div>
  );
}
