import "server-only";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  loadPlatformContext,
  PlatformForbiddenError,
  requirePlatformCapability,
} from "./authorization";

const PAGE_SIZE = 25;

const directoryInputSchema = z.object({
  query: z.string().trim().max(80).optional().default(""),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
});

export type PlatformOrganization = {
  id: string;
  name: string;
  industryKey: string;
  countryCode: string;
  createdAt: string;
};

export type PlatformOrganizationDirectory = {
  organizations: PlatformOrganization[];
  query: string;
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

/**
 * Platform-only, allowlisted organization metadata. No customer, employee,
 * sales, inventory, accounting, or other tenant business records are read.
 * The narrow directory read and its platform audit record share one DB
 * transaction so an unlogged response is not returned if audit persistence
 * fails.
 */
export async function getPlatformOrganizationDirectory(
  input: unknown,
): Promise<PlatformOrganizationDirectory> {
  const user = await getCurrentUser();
  if (!user) throw new PlatformForbiddenError();
  const context = requirePlatformCapability(
    await loadPlatformContext(user.id),
    "platform.organizations.view",
  );
  const parsed = directoryInputSchema.parse(input);
  const query = parsed.query;
  const page = parsed.page;
  const where = query ? { name: { contains: query, mode: "insensitive" as const } } : {};

  return db.$transaction(async (tx) => {
    const total = await tx.organization.count({ where });
    const rows = await tx.organization.findMany({
      where,
      select: {
        id: true,
        name: true,
        industryKey: true,
        countryCode: true,
        createdAt: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });

    await tx.platformAuditLog.create({
      data: {
        actorPrincipalId: context.principalId,
        action: "platform.organizations.directory_viewed",
        targetType: "OrganizationDirectory",
        metadata: {
          page,
          resultCount: rows.length,
          organizationIds: rows.map(({ id }) => id),
          searchApplied: query.length > 0,
        },
      },
    });

    return {
      organizations: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      query,
      page,
      pageSize: PAGE_SIZE,
      total,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  });
}
