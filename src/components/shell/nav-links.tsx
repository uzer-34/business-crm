"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { findActiveModuleKey, type NavGroup } from "@/lib/navigation/build";

/** Flattens groups so active detection runs against every visible destination. */
function useActiveKey(groups: NavGroup[]) {
  const pathname = usePathname();
  return findActiveModuleKey(
    pathname,
    groups.flatMap((group) => group.items),
  );
}

export function SidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const activeKey = useActiveKey(groups);

  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          {/*
            "Overview" holds a single dashboard link; a heading above one item
            is noise, so the label is only rendered for real groups.
          */}
          {group.items.length > 1 || group.key !== "overview" ? (
            <p className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-foreground-subtle uppercase">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeKey;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-selected text-foreground"
                    : "text-foreground-muted hover:bg-hover hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
