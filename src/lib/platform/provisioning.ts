import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const BOOTSTRAP_CAPABILITIES = new Set([
  "platform.organizations.view",
  "platform.security.manage",
]);
type BootstrapCapability = "platform.organizations.view" | "platform.security.manage";

export type ProvisionPlatformPrincipalInput = {
  userId: string;
  token: string;
  now?: Date;
};

function hashBootstrapToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Consumes a DB-operator-issued, one-time authorization and creates exactly
 * one directory-view principal. It is not exposed as an application action;
 * the CLI additionally refuses non-loopback database URLs. Bootstrap can
 * issue only the organization-view or separately designated security-admin
 * capability. All effects,
 * including the bootstrap audit record, are in one transaction.
 */
export async function provisionPlatformPrincipalFromBootstrap(
  input: ProvisionPlatformPrincipalInput,
): Promise<{ principalId: string; capability: BootstrapCapability }> {
  if (!input.userId.trim()) throw new Error("A target user ID is required");
  if (input.token.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) {
    throw new Error("Bootstrap token is invalid");
  }

  const env = await import("./provisioning-target");
  env.assertLocalPlatformProvisioningTarget(process.env);

  const now = input.now ?? new Date();
  const tokenHash = hashBootstrapToken(input.token);

  return db.$transaction(async (tx) => {
    const authorization = await tx.platformBootstrapAuthorization.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        capability: true,
        operatorReference: true,
        expiresAt: true,
        consumedAt: true,
        revokedAt: true,
      },
    });

    if (!authorization) throw new Error("Bootstrap authorization is invalid");
    const storedHash = Buffer.from(authorization.tokenHash, "utf8");
    const suppliedHash = Buffer.from(tokenHash, "utf8");
    if (
      storedHash.length !== suppliedHash.length ||
      !timingSafeEqual(storedHash, suppliedHash) ||
      authorization.userId !== input.userId ||
      !BOOTSTRAP_CAPABILITIES.has(authorization.capability) ||
      authorization.consumedAt !== null ||
      authorization.revokedAt !== null ||
      authorization.expiresAt <= now ||
      !authorization.operatorReference.trim()
    ) {
      throw new Error("Bootstrap authorization is invalid or no longer available");
    }

    const claimed = await tx.platformBootstrapAuthorization.updateMany({
      where: {
        id: authorization.id,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) throw new Error("Bootstrap authorization was already consumed");

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        memberships: {
          where: { status: "ACTIVE", role: { is: { key: "owner" } } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user) throw new Error("Target user does not exist");
    if (user.memberships.length > 0) {
      throw new Error("An active tenant Owner cannot be provisioned as a platform principal");
    }

    const principal = await tx.platformPrincipal.create({
      data: { userId: user.id, status: "ACTIVE" },
      select: { id: true },
    });
    await tx.platformGrant.create({
      data: { principalId: principal.id, capability: authorization.capability },
      select: { id: true },
    });
    await tx.platformAuditLog.create({
      data: {
        actorExternalReference: authorization.operatorReference,
        action: "platform.bootstrap.principal_provisioned",
        targetType: "PlatformPrincipal",
        targetId: principal.id,
        metadata: { capability: authorization.capability },
      },
      select: { id: true },
    });

    return { principalId: principal.id, capability: authorization.capability as BootstrapCapability };
  });
}
