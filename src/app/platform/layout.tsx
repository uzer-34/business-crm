import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { loadPlatformContext } from "@/lib/platform/authorization";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const platformContext = await loadPlatformContext(user.id);
  if (!platformContext) notFound();
  const platformHome = platformContext.capabilities.has("platform.organizations.view")
    ? "/platform/organizations"
    : platformContext.capabilities.has("platform.licensing.view")
      ? "/platform/licensing"
      : null;

  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {platformHome ? (
            <Link href={platformHome} className="flex items-center gap-3 font-semibold tracking-tight">
              <span className="grid size-9 place-items-center rounded-xl bg-accent text-sm font-bold text-accent-foreground">
                B
              </span>
              <span>Business CRM</span>
              <span className="rounded-full border border-border px-2 py-1 text-[11px] font-medium text-foreground-muted">
                Platform
              </span>
            </Link>
          ) : (
            <div className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-sm font-bold text-accent-foreground">
              B
            </span>
            <span>Business CRM</span>
            <span className="rounded-full border border-border px-2 py-1 text-[11px] font-medium text-foreground-muted">
              Platform
            </span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <nav aria-label="Platform navigation" className="flex items-center gap-1 sm:gap-2">
              {platformContext.capabilities.has("platform.organizations.view") ? (
                <Link
                  href="/platform/organizations"
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
                >
                  Organizations
                </Link>
              ) : null}
              {platformContext.capabilities.has("platform.licensing.view") ? (
                <Link
                  href="/platform/licensing"
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
                >
                  Licensing
                </Link>
              ) : null}
            </nav>
            <p className="hidden text-xs text-foreground-muted sm:block">Control plane</p>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
