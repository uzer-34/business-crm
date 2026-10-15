import "server-only";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  loadPlatformContext,
  PlatformForbiddenError,
  requirePlatformCapability,
} from "./authorization";

const statusInput = z.object({
  principalId: z.string().trim().min(1).max(128),
  status: z.enum(["ACTIVE", "DISABLED"]),
  reason: z.string().trim().min(8).max(300),
});

const directoryGrantInput = z.object({
  principalId: z.string().trim().min(1).max(128),
  enabled: z.boolean(),
  reason: z.string().trim().min(8).max(300),
});

export class PlatformPrincipalConflictError extends Error {
  constructor() {
    super("Platform principal changed concurrently; reload and retry");
    this.name = "PlatformPrincipalConflictError";
  }
}

async function requireSecurityActor() {
  const user = await getCurrentUser();
  if (!user) throw new PlatformForbiddenError();
  return requirePlatformCapability(
    await loadPlatformContext(user.id),
    "platform.security.manage",
  );
}

/**
 * Internal server-only control-plane operation. No Server Action or public
 * route exposes it. Security administrators must be designated out of band;
 * this function cannot create principals or grant platform.security.manage.
 */
export async function setPlatformPrincipalStatus(input: unknown): Promise<void> {
  const parsed = statusInput.parse(input);
  const actor = await requireSecurityActor();
  if (actor.principalId === parsed.principalId) {
    throw new PlatformForbiddenError();
  }

  await db.$transaction(async (tx) => {
    const target = await tx.platformPrincipal.findUnique({
      where: { id: parsed.principalId },
      select: {
        id: true,
        status: true,
        user: {
          select: {
            memberships: {
              where: { status: "ACTIVE", role: { is: { key: "owner" } } },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!target) throw new Error("Platform principal was not found");
    if (parsed.status === "ACTIVE" && target.user.memberships.length > 0) {
      throw new PlatformForbiddenError();
    }
    if (target.status === parsed.status) return;

    const changed = await tx.platformPrincipal.updateMany({
      where: { id: target.id, status: target.status },
      data: { status: parsed.status },
    });
    if (changed.count !== 1) throw new PlatformPrincipalConflictError();

    await tx.platformAuditLog.create({
      data: {
        actorPrincipalId: actor.principalId,
        action: "platform.principals.status_changed",
        targetType: "PlatformPrincipal",
        targetId: target.id,
        metadata: { from: target.status, to: parsed.status, reason: parsed.reason },
      },
      select: { id: true },
    });
  });
}

/**
 * Narrow grant maintenance for the already-approved organization directory
 * capability. This is not a generic grant editor and cannot grant or revoke
 * security-management or licensing capabilities.
 */
export async function setPlatformOrganizationDirectoryGrant(input: unknown): Promise<void> {
  const parsed = directoryGrantInput.parse(input);
  const actor = await requireSecurityActor();
  if (actor.principalId === parsed.principalId) throw new PlatformForbiddenError();

  await db.$transaction(async (tx) => {
    const target = await tx.platformPrincipal.findUnique({
      where: { id: parsed.principalId },
      select: {
        id: true,
        status: true,
        user: {
          select: {
            memberships: {
              where: { status: "ACTIVE", role: { is: { key: "owner" } } },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!target) throw new Error("Platform principal was not found");
    if (parsed.enabled && (target.status !== "ACTIVE" || target.user.memberships.length > 0)) {
      throw new PlatformForbiddenError();
    }

    const grant = await tx.platformGrant.findUnique({
      where: {
        principalId_capability: {
          principalId: target.id,
          capability: "platform.organizations.view",
        },
      },
      select: { id: true, revokedAt: true },
    });
    if (parsed.enabled && grant?.revokedAt === null) return;
    if (!parsed.enabled && (!grant || grant.revokedAt !== null)) return;

    let grantId: string;
    if (!grant) {
      const created = await tx.platformGrant.create({
        data: {
          principalId: target.id,
          capability: "platform.organizations.view",
          grantedByPrincipalId: actor.principalId,
        },
        select: { id: true },
      });
      grantId = created.id;
    } else {
      const updated = await tx.platformGrant.updateMany({
        where: { id: grant.id, revokedAt: grant.revokedAt },
        data: parsed.enabled
          ? {
              revokedAt: null,
              revokedByPrincipalId: null,
              grantedByPrincipalId: actor.principalId,
            }
          : { revokedAt: new Date(), revokedByPrincipalId: actor.principalId },
      });
      if (updated.count !== 1) throw new PlatformPrincipalConflictError();
      grantId = grant.id;
    }

    await tx.platformAuditLog.create({
      data: {
        actorPrincipalId: actor.principalId,
        action: parsed.enabled ? "platform.grants.directory_view_granted" : "platform.grants.directory_view_revoked",
        targetType: "PlatformGrant",
        targetId: grantId,
        metadata: {
          principalId: target.id,
          capability: "platform.organizations.view",
          reason: parsed.reason,
        },
      },
      select: { id: true },
    });
  });
}
