"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/menu";
import type { ResolvedCreateAction } from "@/lib/navigation/create-actions";

export function GlobalCreate({ actions, compact = false }: { actions: ResolvedCreateAction[]; compact?: boolean }) {
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button size="icon" variant="primary" aria-label="Create new record">
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button size="sm" variant="primary">
            <Plus className="size-4" aria-hidden="true" />
            Create
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Create new</DropdownMenuLabel>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem key={action.key} asChild>
              <Link href={action.href}>
                <Icon className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
                {action.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
