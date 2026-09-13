import type { ReactNode } from "react";
import Link from "next/link";
import { getDefaultMembershipOrRedirect } from "@/lib/organization/actions";
import { logoutAction } from "@/lib/auth/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/branches", label: "Branches" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, membership } = await getDefaultMembershipOrRedirect();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col border-r border-border bg-card px-4 py-6 sm:flex">
        <div className="mb-8 px-2">
          <p className="text-sm font-semibold">{membership.organization.name}</p>
          <p className="text-xs text-muted-foreground">{membership.role.name}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border pt-4">
          <p className="truncate px-2 text-xs text-muted-foreground">{user.email ?? user.phone}</p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="mt-2 w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3 sm:hidden">
          <p className="text-sm font-semibold">{membership.organization.name}</p>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-muted-foreground">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 bg-background px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
