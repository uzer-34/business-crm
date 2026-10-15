import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PlatformForbiddenError } from "@/lib/platform/authorization";
import { getPlatformOrganizationDirectory } from "@/lib/platform/organization-directory";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from "@/components/ui/table";

type SearchParams = { q?: string | string[]; page?: string | string[] };

function singleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const params = await searchParams;
  const rawPage = Number(singleValue(params.page) ?? "1");
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10_000) : 1;
  let directory;

  try {
    directory = await getPlatformOrganizationDirectory({
      query: (singleValue(params.q) ?? "").slice(0, 80),
      page: requestedPage,
    });
  } catch (error) {
    if (error instanceof PlatformForbiddenError) notFound();
    throw error;
  }

  const previousHref = `/platform/organizations?${new URLSearchParams({
    ...(directory.query ? { q: directory.query } : {}),
    page: String(directory.page - 1),
  })}`;
  const nextHref = `/platform/organizations?${new URLSearchParams({
    ...(directory.query ? { q: directory.query } : {}),
    page: String(directory.page + 1),
  })}`;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Platform / Organizations
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Organization directory</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground-muted">
            Review organization profile metadata. Tenant customer, employee, sales, inventory, and financial records are not shown here.
          </p>
        </div>
        <form action="/platform/organizations" method="get" role="search" className="flex w-full gap-2 sm:max-w-md">
          <label className="sr-only" htmlFor="organization-search">Search organizations</label>
          <Input
            id="organization-search"
            name="q"
            type="search"
            placeholder="Search organization name"
            defaultValue={directory.query}
            maxLength={80}
          />
          <button
            type="submit"
            className="h-9 shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </form>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Profile metadata only</CardDescription>
          </div>
          <p className="tabular text-sm text-foreground-muted" aria-live="polite">
            {directory.total.toLocaleString()} total
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <TableWrapper>
            <Table>
              <THead>
                <TR className="hover:bg-surface-sunken">
                  <TH>Organization</TH>
                  <TH>Industry</TH>
                  <TH>Country</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {directory.organizations.length ? (
                  directory.organizations.map((organization) => (
                    <TR key={organization.id}>
                      <TD>
                        <div className="font-medium">{organization.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-foreground-subtle">
                          {organization.id}
                        </div>
                      </TD>
                      <TD className="text-foreground-muted">{organization.industryKey}</TD>
                      <TD className="tabular text-foreground-muted">{organization.countryCode}</TD>
                      <TD className="tabular text-foreground-muted">{organization.createdAt.slice(0, 10)}</TD>
                    </TR>
                  ))
                ) : (
                  <TR>
                    <TD colSpan={4} className="py-14 text-center">
                      <p className="font-medium">No organizations found</p>
                      <p className="mt-1 text-sm text-foreground-muted">
                        Try another search term or clear the filter.
                      </p>
                      {directory.query ? (
                        <Link href="/platform/organizations" className="mt-3 inline-block text-sm font-medium text-accent">
                          Clear search
                        </Link>
                      ) : null}
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </TableWrapper>
        </CardContent>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="tabular text-xs text-foreground-muted">
            Page {directory.page} of {directory.pageCount}
          </p>
          <nav aria-label="Organization directory pagination" className="flex items-center gap-2">
            {directory.page > 1 ? (
              <Link href={previousHref} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-hover">
                Previous
              </Link>
            ) : (
              <span aria-disabled="true" className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground-subtle">
                Previous
              </span>
            )}
            {directory.page < directory.pageCount ? (
              <Link href={nextHref} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-hover">
                Next
              </Link>
            ) : (
              <span aria-disabled="true" className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground-subtle">
                Next
              </span>
            )}
          </nav>
        </div>
      </Card>
    </main>
  );
}
