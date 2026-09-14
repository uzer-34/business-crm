"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { archiveCustomFieldDefinitionAction } from "@/lib/industry/custom-field-actions";

export function ArchiveFieldButton({ definitionId }: { definitionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await archiveCustomFieldDefinitionAction(definitionId);
          router.refresh();
        });
      }}
    >
      {isPending ? "Removing…" : "Remove"}
    </Button>
  );
}
