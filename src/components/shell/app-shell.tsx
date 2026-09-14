"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Building2, ChevronDown, LogOut, Menu, Search, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import {
  buildMobilePrimaryNav,
  buildNavigation,
  findActiveModuleKey,
  MORE_NAV_ITEM,
  type NavigationContext,
} from "@/lib/navigation/build";
import { buildCreateActions } from "@/lib/navigation/create-actions";
import { SidebarNav } from "./nav-links";
import { GlobalCreate } from "./global-create";
import { CommandPalette } from "./command-palette";

export interface ShellUser {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ShellOrganization {
  id: string;
  name: string;
}

/*
 * Application shell.
 *
 * Navigation is computed on the client from serializable inputs (permission
 * keys + industry key) rather than being passed in pre-rendered, because the
 * registries carry Lucide icon components, which are functions and therefore
 * cannot cross the server/client boundary as props. The same pure builders run
 * here and in tests. This is presentation only — every route and action still
 * authorizes on the server.
 */
export function AppShell({
  user,
  organizations,
  activeOrganizationId,
  roleName,
  branchName,
  permissions,
  industryKey,
  onSwitchOrganization,
  onSignOut,
  notificationSlot,
  children,
}: {
  user: ShellUser;
  organizations: ShellOrganization[];
  activeOrganizationId: string;
  roleName: string;
  branchName: string | null;
  permissions: string[];
  industryKey: string;
  onSwitchOrganization: (organizationId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  notificationSlot: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const context: NavigationContext = React.useMemo(
    () => ({ permissions: new Set(permissions), industryKey }),
    [permissions, industryKey],
  );

  const navGroups = React.useMemo(() => buildNavigation(context), [context]);
  const createActions = React.useMemo(() => buildCreateActions(context), [context]);
  const mobilePrimary = React.useMemo(() => buildMobilePrimaryNav(context), [context]);
  const activeKey = findActiveModuleKey(
    pathname,
    navGroups.flatMap((group) => group.items),
  );

  // Route changes must dismiss the drawer, otherwise tapping a link leaves the
  // overlay covering the page it just navigated to.
  const [previousPathname, setPreviousPathname] = React.useState(pathname);
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setDrawerOpen(false);
  }

  const activeOrganization = organizations.find((org) => org.id === activeOrganizationId);
  const identity = user.name ?? user.email ?? user.phone ?? "Account";

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop sidebar. Hidden below lg, where the drawer takes over. */}
      {/*
        Pinned to the viewport height so the nav scrolls inside the sidebar and
        the account menu in the footer stays reachable — without this the aside
        grows with its content and the footer falls below the fold.
      */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="border-b border-border p-3">
          <OrgSwitcherMenu
            organizations={organizations}
            activeOrganization={activeOrganization}
            roleName={roleName}
            branchName={branchName}
            onSwitch={onSwitchOrganization}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav groups={navGroups} />
        </div>
        <div className="border-t border-border p-3">
          <UserMenu identity={identity} onSignOut={onSignOut} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
          <IconButton
            label="Open navigation menu"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="mobile-navigation-drawer"
          >
            <Menu className="size-5" aria-hidden="true" />
          </IconButton>

          <span className="truncate text-sm font-semibold lg:hidden">{activeOrganization?.name ?? "Workspace"}</span>

          {/*
            Two presentations of one control: a wide affordance that shows the
            shortcut on desktop, and an icon button on small screens where the
            bar has no room and there is no physical keyboard to hint at.
          */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden h-9 w-full max-w-sm cursor-pointer items-center gap-2 rounded-md border border-border bg-canvas px-3 text-[13px] text-foreground-subtle transition-colors hover:border-border-strong md:flex"
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span>Search…</span>
            <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1 md:ml-2">
            <IconButton label="Search" className="md:hidden" onClick={() => setPaletteOpen(true)}>
              <Search className="size-5" aria-hidden="true" />
            </IconButton>
            {notificationSlot}
            <div className="hidden sm:block">
              <GlobalCreate actions={createActions} />
            </div>
            <div className="sm:hidden">
              <GlobalCreate actions={createActions} compact />
            </div>
          </div>
        </header>

        {/* pb-16 clears the fixed mobile bottom bar so content is never hidden behind it. */}
        <main className="min-w-0 flex-1 px-3 pt-4 pb-20 sm:px-4 sm:pb-8 lg:px-6">{children}</main>
      </div>

      <MobileBottomNav
        items={mobilePrimary}
        activeKey={activeKey}
        onMore={() => setDrawerOpen(true)}
        moreActive={drawerOpen}
      />

      {/*
        Radix Dialog supplies the overlay, Escape handling, outside-click
        dismissal, focus trap, focus restore and body scroll lock that a
        hand-rolled drawer would have to reimplement.
      */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" id="mobile-navigation-drawer" className="lg:hidden">
          <div className="flex items-center justify-between border-b border-border p-3">
            <DialogPrimitive.Title className="truncate text-sm font-semibold">
              {activeOrganization?.name ?? "Workspace"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close navigation menu" size="icon-sm">
                <X className="size-4" aria-hidden="true" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Navigate to any area you have access to.
          </DialogPrimitive.Description>

          <div className="flex-1 overflow-y-auto p-3">
            {organizations.length > 1 && (
              <div className="mb-3">
                <OrgSwitcherMenu
                  organizations={organizations}
                  activeOrganization={activeOrganization}
                  roleName={roleName}
                  branchName={branchName}
                  onSwitch={onSwitchOrganization}
                />
              </div>
            )}
            <SidebarNav groups={navGroups} onNavigate={() => setDrawerOpen(false)} />
          </div>

          <div className="border-t border-border p-3">
            <p className="truncate px-2 pb-2 text-[12px] text-foreground-muted">{identity}</p>
            <form action={onSignOut}>
              <Button type="submit" variant="outline" size="sm" className="w-full">
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </Button>
            </form>
          </div>
        </SheetContent>
      </DialogPrimitive.Root>

      <CommandPalette
        navGroups={navGroups}
        createActions={createActions}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </div>
  );
}

function MobileBottomNav({
  items,
  activeKey,
  onMore,
  moreActive,
}: {
  items: ReturnType<typeof buildMobilePrimaryNav>;
  activeKey: string | null;
  onMore: () => void;
  moreActive: boolean;
}) {
  const MoreIcon = MORE_NAV_ITEM.icon;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors",
              active ? "text-accent" : "text-foreground-muted",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="w-full truncate text-center">{item.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        aria-expanded={moreActive}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors",
          moreActive ? "text-accent" : "text-foreground-muted",
        )}
      >
        <MoreIcon className="size-5 shrink-0" aria-hidden="true" />
        <span className="w-full truncate text-center">{MORE_NAV_ITEM.label}</span>
      </button>
    </nav>
  );
}

function OrgSwitcherMenu({
  organizations,
  activeOrganization,
  roleName,
  branchName,
  onSwitch,
}: {
  organizations: ShellOrganization[];
  activeOrganization: ShellOrganization | undefined;
  roleName: string;
  branchName: string | null;
  onSwitch: (organizationId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const context = [roleName, branchName].filter(Boolean).join(" · ");

  // With a single membership there is nothing to switch to, so this renders as
  // static context rather than a control that does nothing when clicked.
  if (organizations.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-1 py-0.5">
        <Building2 className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{activeOrganization?.name ?? "Workspace"}</p>
          <p className="truncate text-[11px] text-foreground-muted">{context}</p>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-hover disabled:opacity-60"
        >
          <Building2 className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{activeOrganization?.name ?? "Workspace"}</p>
            <p className="truncate text-[11px] text-foreground-muted">{context}</p>
          </div>
          <ChevronDown className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch business</DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => {
              startTransition(async () => {
                await onSwitch(org.id);
                router.push("/dashboard");
                router.refresh();
              });
            }}
          >
            <span className="truncate">{org.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ identity, onSignOut }: { identity: string; onSignOut: () => Promise<void> }) {
  const [, startTransition] = React.useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[11px] font-semibold text-accent-subtle-foreground">
            {identity.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground-muted">{identity}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Signed in</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => startTransition(() => void onSignOut())}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
