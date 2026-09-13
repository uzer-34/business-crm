"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { completeTaskAction } from "@/lib/customer/tasks-actions";

export function TaskRow({
  taskId,
  title,
  dueAt,
  customerName,
  customerId,
  assignedToLabel,
}: {
  taskId: string;
  title: string;
  dueAt: string | null;
  customerName: string | null;
  customerId: string | null;
  assignedToLabel: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {customerId && customerName ? (
              <Link href={`/customers/${customerId}`} className="hover:underline">
                {customerName}
              </Link>
            ) : (
              assignedToLabel && <span>{assignedToLabel}</span>
            )}
            {dueAt && ` · Due ${new Date(dueAt).toLocaleString()}`}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await completeTaskAction(taskId);
              router.refresh();
            });
          }}
        >
          {isPending ? "Saving…" : "Mark done"}
        </Button>
      </CardContent>
    </Card>
  );
}
