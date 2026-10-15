import "server-only";
import { z } from "zod";
import { PlatformEntitlementState, PlatformPurchaseKind } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  loadPlatformContext,
  PlatformForbiddenError,
  requirePlatformCapability,
} from "../authorization";
import { calculatePlatformBillingSummary } from "./billing";

const PAGE_SIZE = 25;
const directoryInput = z.object({
  organizationId: z.string().trim().min(1).max(128).optional(),
  query: z.string().trim().max(80).optional().default(""),
  kind: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.enum(PlatformPurchaseKind).optional(),
  ),
  entitlementState: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.enum(PlatformEntitlementState).optional(),
  ),
  page: z.union([z.string(), z.number()])
    .optional()
    .transform((value) => value === undefined ? 1 : Number(value))
    .pipe(z.number().int().min(1).max(10_000)),
});

async function currentPlatformContext(capability: "platform.licensing.view") {
  const user = await getCurrentUser();
  if (!user) throw new PlatformForbiddenError();
  return requirePlatformCapability(await loadPlatformContext(user.id), capability);
}

/** Platform-only metadata; this never reads tenant invoices or customer payments. */
export async function getPlatformPurchaseDirectory(input: unknown) {
  const parsed = directoryInput.parse(input);
  const context = await currentPlatformContext("platform.licensing.view");

  return db.$transaction(async (tx) => {
    const where: Prisma.PlatformPurchaseWhereInput = {
      ...(parsed.organizationId ? { organizationId: parsed.organizationId } : {}),
      ...(parsed.kind ? { kind: parsed.kind } : {}),
      ...(parsed.entitlementState
        ? { entitlement: { is: { state: parsed.entitlementState } } }
        : {}),
      ...(parsed.query
        ? {
            organization: {
              is: { name: { contains: parsed.query, mode: "insensitive" } },
            },
          }
        : {}),
    };
    const total = await tx.platformPurchase.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(parsed.page, pageCount);
    const rows = await tx.platformPurchase.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        organizationId: true,
        organization: {
          select: { id: true, name: true, industryKey: true, countryCode: true },
        },
        kind: true,
        contractAmount: true,
        currencyCode: true,
        createdAt: true,
        entitlement: { select: { id: true, state: true, updatedAt: true } },
        schedule: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            kind: true,
            sequence: true,
            dueAt: true,
            amount: true,
            currencyCode: true,
            status: true,
            payments: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                direction: true,
                status: true,
                amount: true,
                currencyCode: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    await tx.platformAuditLog.create({
      data: {
        actorPrincipalId: context.principalId,
        action: "platform.licensing.purchase_directory_viewed",
        targetType: "PlatformPurchaseDirectory",
        targetId: parsed.organizationId ?? null,
        metadata: {
          page,
          resultCount: rows.length,
          purchaseIds: rows.map((row) => row.id),
          searchApplied: parsed.query.length > 0,
          kind: parsed.kind ?? null,
          entitlementState: parsed.entitlementState ?? null,
        },
      },
      select: { id: true },
    });

    return {
      purchases: rows.map((purchase) => {
        const schedule = purchase.schedule.map((item) => ({
          id: item.id,
          kind: item.kind,
          sequence: item.sequence,
          dueAt: item.dueAt,
          amount: item.amount.toFixed(2),
          currencyCode: item.currencyCode,
          status: item.status,
        }));
        const payments = purchase.schedule.flatMap((item) =>
          item.payments.map((payment) => ({
            id: payment.id,
            scheduleItemId: item.id,
            direction: payment.direction,
            status: payment.status,
            amount: payment.amount.toFixed(2),
            currencyCode: payment.currencyCode,
            createdAt: payment.createdAt,
          })),
        );

        return {
          id: purchase.id,
          organizationId: purchase.organizationId,
          organization: purchase.organization,
          kind: purchase.kind,
          contractAmount: purchase.contractAmount.toFixed(2),
          currencyCode: purchase.currencyCode,
          createdAt: purchase.createdAt,
          entitlement: purchase.entitlement,
          schedule,
          payments,
          billing: schedule.length
            ? calculatePlatformBillingSummary({
                schedule: purchase.schedule,
                payments: purchase.schedule.flatMap((item) =>
                  item.payments.map((payment) => ({
                    scheduleItemId: item.id,
                    amount: payment.amount.toFixed(2),
                    currencyCode: payment.currencyCode,
                    direction: payment.direction,
                    status: payment.status,
                  })),
                ),
                asOf: new Date(),
              })
            : null,
        };
      }),
      query: parsed.query,
      kind: parsed.kind ?? "",
      entitlementState: parsed.entitlementState ?? "",
      page,
      pageSize: PAGE_SIZE,
      total,
      pageCount,
    };
  });
}
