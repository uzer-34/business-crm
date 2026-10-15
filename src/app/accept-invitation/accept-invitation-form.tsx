"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acceptEmployeeInvitationAction } from "@/lib/employees/employee-actions";

export function AcceptInvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await acceptEmployeeInvitationAction(token);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push("/dashboard");
          router.refresh();
        });
      }}
      className="flex flex-col gap-3"
    >
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Accepting…" : "Accept invitation"}
      </Button>
    </form>
  );
}
