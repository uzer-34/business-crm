import Link from "next/link";
import { Building2, CalendarDays, CreditCard, Wallet } from "lucide-react";
import { PlatformEntitlementState, PlatformPurchaseKind } from "@/generated/prisma/enums";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Input, NativeSelect } from "@/components/ui/input";
import { PlatformForbiddenError } from "@/lib/platform/authorization";
import { getPlatformPurchaseDirectory } from "@/lib/platform/licensing/data-access";

type SearchParams = {
  q?: string | string[];
  kind?: string | string[];
  entitlementState?: string | string[];
  page?: string | string[];
};

function formatDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function formatMoney(amount: string, currencyCode: string): string {
  return `${currencyCode} ${amount}`;
}

function purchaseKindLabel(kind: string): string {
  return kind.charAt(0) + kind.slice(1).toLowerCase();
}

function stateTone(state: string | undefined): "neutral" | "success" | "warning" | "danger" {
  if (state === "ACTIVE") return "success";
  if (state === "PENDING") return "warning";
  if (state === "SUSPENDED" || state === "REVOKED") return "danger";
  return "neutral";
}

function directoryHref(input: {
  query: string;
  kind: string;
  entitlementState: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.kind) params.set("kind", input.kind);
  if (input.entitlementState) params.set("entitlementState", input.entitlementState);
  params.set("page", String(input.page));
  return `/platform/licensing?${params.toString()}`;
}

export default async function PlatformLicensingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  let directory;

  try {
    directory = await getPlatformPurchaseDirectory({
      query: params.q,
      kind: params.kind,
      entitlementState: params.entitlementState,
      page: params.page,
    });
  } catch (error) {
    if (error instanceof PlatformForbiddenError) {
      return (
        <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
          <Alert tone="danger" title="Licensing access is restricted">
            Your current platform access does not include permission to view licensing records. No licensing data was loaded.
          </Alert>
        </main>
      );
    }
    throw error;
  }

  const previousHref = directoryHref({ ...directory, page: directory.page - 1 });
  const nextHref = directoryHref({ ...directory, page: directory.page + 1 });
  const hasFilters = Boolean(directory.query || directory.kind || directory.entitlementState);

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Platform / Licensing
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Licensing records</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-muted">
            Review persisted platform purchases, entitlement states, scheduled amounts, and recorded payment entries.
            Payment statuses shown here are stored records and are not independently verified.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-raised">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-subtle text-accent-subtle-foreground">
            <CreditCard className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="tabular text-lg font-semibold leading-5">{directory.total.toLocaleString()}</p>
            <p className="mt-1 text-xs text-foreground-muted">persisted purchase records</p>
          </div>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Find licensing records</CardTitle>
          <CardDescription>Search by organization name and narrow the list by recorded purchase or entitlement state.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/platform/licensing" method="get" role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_13rem_13rem_auto_auto] lg:items-end">
            <div className="min-w-0">
              <label htmlFor="licensing-search" className="mb-1.5 block text-xs font-medium">Organization</label>
              <Input
                id="licensing-search"
                name="q"
                type="search"
                placeholder="Search organization name"
                defaultValue={directory.query}
                maxLength={80}
                className="h-11"
              />
            </div>
            <div>
              <label htmlFor="purchase-kind" className="mb-1.5 block text-xs font-medium">Purchase type</label>
              <NativeSelect id="purchase-kind" name="kind" defaultValue={directory.kind} className="h-11">
                <option value="">All types</option>
                {Object.values(PlatformPurchaseKind).map((kind) => (
                  <option key={kind} value={kind}>{purchaseKindLabel(kind)}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <label htmlFor="entitlement-state" className="mb-1.5 block text-xs font-medium">Entitlement state</label>
              <NativeSelect id="entitlement-state" name="entitlementState" defaultValue={directory.entitlementState} className="h-11">
                <option value="">All states</option>
                {Object.values(PlatformEntitlementState).map((state) => (
                  <option key={state} value={state}>{purchaseKindLabel(state)}</option>
                ))}
              </NativeSelect>
            </div>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              <CreditCard className="size-4" aria-hidden="true" />
              Apply filters
            </button>
            {hasFilters ? (
              <Link
                href="/platform/licensing"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-hover"
              >
                Clear
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Platform purchases</CardTitle>
            <CardDescription>Organization profile metadata and platform licensing records only</CardDescription>
          </div>
          <p className="tabular shrink-0 text-sm text-foreground-muted" aria-live="polite">
            {directory.total.toLocaleString()} {directory.total === 1 ? "record" : "records"}
          </p>
        </CardHeader>

        {directory.purchases.length ? (
          <CardContent className="space-y-4">
            {directory.purchases.map((purchase) => {
              const paymentsBySchedule = new Map<string, typeof purchase.payments>();
              for (const payment of purchase.payments) {
                paymentsBySchedule.set(payment.scheduleItemId, [
                  ...(paymentsBySchedule.get(payment.scheduleItemId) ?? []),
                  payment,
                ]);
              }

              return (
                <article key={purchase.id} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Building2 className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
                        <h2 className="text-base font-semibold tracking-tight">{purchase.organization.name}</h2>
                        <Badge tone="accent">{purchaseKindLabel(purchase.kind)}</Badge>
                        <Badge tone={stateTone(purchase.entitlement?.state)}>
                          {purchase.entitlement?.state ? purchaseKindLabel(purchase.entitlement.state) : "No entitlement record"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted">
                        <span>{purchase.organization.industryKey}</span>
                        <span>{purchase.organization.countryCode}</span>
                        <span className="font-mono">{purchase.organizationId}</span>
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-md bg-surface-sunken px-3 py-3 text-sm sm:min-w-[26rem] sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-foreground-muted">Purchase date</dt>
                        <dd className="mt-1 tabular font-medium">{formatDate(purchase.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-foreground-muted">Contract amount</dt>
                        <dd className="mt-1 tabular font-medium">{formatMoney(purchase.contractAmount, purchase.currencyCode)}</dd>
                      </div>
                      {purchase.billing ? (
                        <div>
                          <dt className="text-xs text-foreground-muted">Outstanding</dt>
                          <dd className="mt-1 tabular font-medium">{formatMoney(purchase.billing.totalOutstanding, purchase.billing.currencyCode)}</dd>
                        </div>
                      ) : (
                        <div>
                          <dt className="text-xs text-foreground-muted">Billing schedule</dt>
                          <dd className="mt-1 font-medium">Not recorded</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {purchase.billing ? (
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-sm">
                      <p className="inline-flex items-center gap-2 text-foreground-muted">
                        <CalendarDays className="size-4" aria-hidden="true" />
                        <span>Scheduled payments: <span className="font-medium text-foreground">{purchase.schedule.length}</span></span>
                      </p>
                      <p className="inline-flex items-center gap-2 text-foreground-muted">
                        <Wallet className="size-4" aria-hidden="true" />
                        <span>Due now: <span className="tabular font-medium text-foreground">{formatMoney(purchase.billing.amountDueNow, purchase.billing.currencyCode)}</span></span>
                      </p>
                    </div>
                  ) : null}

                  <details className="group mt-3 border-t border-border pt-3">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-medium marker:hidden focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
                      <span>Billing schedule and payment history</span>
                      <span className="text-xs font-normal text-foreground-muted">
                        {purchase.schedule.length} due items · {purchase.payments.length} recorded entries
                      </span>
                    </summary>
                    <div className="mt-3 space-y-4">
                      {purchase.schedule.length ? (
                        <ol className="space-y-2">
                          {purchase.schedule.map((item) => (
                            <li key={item.id} className="rounded-md border border-border bg-surface px-3 py-3">
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div>
                                  <p className="text-xs text-foreground-muted">Due date</p>
                                  <p className="mt-1 tabular text-sm font-medium">{formatDate(item.dueAt)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-foreground-muted">Scheduled amount</p>
                                  <p className="mt-1 tabular text-sm font-medium">{formatMoney(item.amount, item.currencyCode)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-foreground-muted">Schedule state</p>
                                  <p className="mt-1 text-sm font-medium">{item.status}</p>
                                </div>
                              </div>
                              <div className="mt-3 border-t border-border pt-3">
                                <p className="mb-2 text-xs font-medium text-foreground-muted">Payment history recorded for this due item</p>
                                {paymentsBySchedule.get(item.id)?.length ? (
                                  <ul className="space-y-2">
                                    {paymentsBySchedule.get(item.id)!.map((payment) => (
                                      <li key={payment.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                        <span>{purchaseKindLabel(payment.direction)}</span>
                                        <span className="tabular font-medium">{formatMoney(payment.amount, payment.currencyCode)}</span>
                                        <Badge>{payment.status}</Badge>
                                        <span className="text-xs text-foreground-muted">recorded {formatDate(payment.createdAt)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-foreground-muted">No payment entry recorded</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="rounded-md bg-surface-sunken px-3 py-3 text-sm text-foreground-muted">
                          No billing schedule is recorded for this purchase.
                        </p>
                      )}
                      <p className="text-xs leading-5 text-foreground-muted">
                        Payment statuses are displayed as persisted; this interface does not verify, settle, refund, or change payment or entitlement records.
                      </p>
                    </div>
                  </details>
                </article>
              );
            })}
          </CardContent>
        ) : (
          <CardContent className="border-t border-border">
            <EmptyState
              icon={CreditCard}
              title={hasFilters ? "No matching licensing records" : "No platform purchase records yet"}
              description={hasFilters
                ? "No persisted records match these filters. Clear them or adjust your search."
                : "Platform purchase records will appear here after an authorized provisioning workflow records them."}
              action={hasFilters ? (
                <Link href="/platform/licensing" className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-hover">
                  Clear filters
                </Link>
              ) : undefined}
            />
          </CardContent>
        )}

        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="tabular text-xs text-foreground-muted">
            Page {directory.page} of {directory.pageCount}
          </p>
          <nav aria-label="Licensing directory pagination" className="flex items-center gap-2">
            {directory.page > 1 ? (
              <Link href={previousHref} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-hover">Previous</Link>
            ) : (
              <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm text-foreground-subtle">Previous</span>
            )}
            {directory.page < directory.pageCount ? (
              <Link href={nextHref} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-hover">Next</Link>
            ) : (
              <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm text-foreground-subtle">Next</span>
            )}
          </nav>
        </div>
      </Card>
    </main>
  );
}
