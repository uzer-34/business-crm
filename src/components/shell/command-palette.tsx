"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, Search } from "lucide-react";
import { globalSearch, type SearchResult, type SearchResultType } from "@/lib/search/global-search";
import type { NavGroup } from "@/lib/navigation/build";
import type { ResolvedCreateAction } from "@/lib/navigation/create-actions";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<SearchResultType, string> = {
  customer: "Customers",
  order: "Orders",
  invoice: "Invoices",
  product: "Products",
  vehicle: "Vehicles",
  supplier: "Suppliers",
  task: "Tasks",
};

const RESULT_ORDER: SearchResultType[] = ["customer", "order", "invoice", "product", "vehicle", "supplier", "task"];

/**
 * Command palette (Cmd/Ctrl+K).
 *
 * Record search runs server-side through `globalSearch`, which re-derives the
 * caller's org and permissions — the palette itself is never the authority on
 * what is visible. Navigation and create commands come from the same
 * registries the sidebar uses, so nothing can drift between them.
 *
 * cmdk's own filtering is disabled for records (the server already ranked
 * them) but left on for the static command lists.
 */
export function CommandPalette({
  navGroups,
  createActions,
  open,
  onOpenChange,
}: {
  navGroups: NavGroup[];
  createActions: ResolvedCreateAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // Closing clears the palette so it never reopens showing the last search.
  const [previousOpen, setPreviousOpen] = React.useState(open);
  if (previousOpen !== open) {
    setPreviousOpen(open);
    if (!open) {
      setQuery("");
      setResults([]);
      setSearching(false);
    }
  }

  /*
   * Search runs from the change handler rather than an effect: typing is the
   * event that should trigger it, and doing it here keeps the debounce timer
   * and the in-flight request in refs instead of re-running on every render.
   * `requestId` discards a slow earlier response that lands after a newer one.
   */
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = React.useRef(0);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      requestIdRef.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(() => {
      globalSearch(trimmed)
        .then((found) => {
          if (requestId === requestIdRef.current) setResults(found);
        })
        .catch(() => {
          if (requestId === requestIdRef.current) setResults([]);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setSearching(false);
        });
    }, 200);
  };

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const grouped = RESULT_ORDER.map((type) => ({
    type,
    items: results.filter((result) => result.type === type),
  })).filter((group) => group.items.length > 0);

  const navItems = navGroups.flatMap((group) => group.items);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          aria-label="Search and commands"
          className="fixed top-[10vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-overlay"
        >
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search records, or jump to a page.
          </DialogPrimitive.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b border-border px-3">
              {searching ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-foreground-subtle" aria-hidden="true" />
              ) : (
                <Search className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
              )}
              <Command.Input
                value={query}
                onValueChange={handleQueryChange}
                placeholder="Search records or type a command…"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
              />
            </div>

            <Command.List className="max-h-[min(24rem,60dvh)] overflow-y-auto p-1.5">
              {query.trim().length >= 2 && !searching && results.length === 0 && (
                <Command.Empty className="px-3 py-8 text-center text-[13px] text-foreground-muted">
                  No records match “{query.trim()}”.
                </Command.Empty>
              )}

              {grouped.map((group) => (
                <Group key={group.type} heading={TYPE_LABEL[group.type]}>
                  {group.items.map((result) => (
                    <Item key={`${result.type}-${result.id}`} onSelect={() => go(result.href)}>
                      <span className="min-w-0 flex-1 truncate">{result.title}</span>
                      {result.subtitle && (
                        <span className="shrink-0 truncate text-[12px] text-foreground-subtle">{result.subtitle}</span>
                      )}
                    </Item>
                  ))}
                </Group>
              ))}

              <StaticCommands query={query} navItems={navItems} createActions={createActions} onSelect={go} />
            </Command.List>

            <div className="hidden items-center justify-end gap-3 border-t border-border px-3 py-1.5 text-[11px] text-foreground-subtle sm:flex">
              <span>
                <kbd className="rounded border border-border px-1">↑</kbd>{" "}
                <kbd className="rounded border border-border px-1">↓</kbd> navigate
              </span>
              <span>
                <kbd className="rounded border border-border px-1">↵</kbd> open
              </span>
              <span>
                <kbd className="rounded border border-border px-1">esc</kbd> close
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Navigation/create commands, filtered client-side against the same query. */
function StaticCommands({
  query,
  navItems,
  createActions,
  onSelect,
}: {
  query: string;
  navItems: NavGroup["items"];
  createActions: ResolvedCreateAction[];
  onSelect: (href: string) => void;
}) {
  const needle = query.trim().toLowerCase();
  const matches = (label: string) => needle.length === 0 || label.toLowerCase().includes(needle);

  const navMatches = navItems.filter((item) => matches(`go to ${item.label}`));
  const createMatches = createActions.filter((action) => matches(`create ${action.label}`));

  return (
    <>
      {createMatches.length > 0 && (
        <Group heading="Create">
          {createMatches.map((action) => {
            const Icon = action.icon;
            return (
              <Item key={action.key} onSelect={() => onSelect(action.href)}>
                <Icon className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
                Create {action.label}
              </Item>
            );
          })}
        </Group>
      )}

      {navMatches.length > 0 && (
        <Group heading="Go to">
          {navMatches.map((item) => {
            const Icon = item.icon;
            return (
              <Item key={item.key} onSelect={() => onSelect(item.href)}>
                <Icon className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
                {item.label}
              </Item>
            );
          })}
        </Group>
      )}
    </>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground-subtle [&_[cmdk-group-heading]]:uppercase"
    >
      {children}
    </Command.Group>
  );
}

function Item({ onSelect, children }: { onSelect: () => void; children: React.ReactNode }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-[13px] text-foreground",
        "data-[selected=true]:bg-hover",
      )}
    >
      {children}
    </Command.Item>
  );
}
