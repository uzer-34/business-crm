import "server-only";
import { db } from "@/lib/db";

export const PLATFORM_CAPABILITIES = [
  "platform.organizations.view",
  "platform.security.manage",
  "platform.licensing.view",
  "platform.licensing.manage",
  "platform.payments.record",
] as const;
export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

const platformCapabilitySet: ReadonlySet<string> = new Set(PLATFORM_CAPABILITIES);

export function isPlatformCapability(value: string): value is PlatformCapability {
  return platformCapabilitySet.has(value);
}

export type PlatformContext = {
  principalId: string;
  userId: string;
  capabilities: ReadonlySet<PlatformCapability>;
};

export class PlatformForbiddenError extends Error {
  constructor() {
    super("Platform access is not available");
    this.name = "PlatformForbiddenError";
  }
}

/**
 * Resolves platform authorization independently from tenant roles. The
 * feature flag is a fail-closed release gate; the principal and its explicit
 * platform grants are reloaded from the database on each request.
 */
export async function loadPlatformContext(userId: string): Promise<PlatformContext | null> {
  if (process.env.PLATFORM_CONTROL_PLANE_ENABLED !== "true") return null;

  const principal = await db.platformPrincipal.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      grants: {
        where: { revokedAt: null },
        select: { capability: true },
      },
      // A tenant Owner must not also receive platform access through this
      // shared authentication identity. Tenant roles never supply grants.
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

  if (!principal || principal.status !== "ACTIVE" || principal.user.memberships.length > 0) {
    return null;
  }

  return {
    principalId: principal.id,
    userId,
    capabilities: new Set(
      principal.grants
        .map(({ capability }) => capability)
        .filter(isPlatformCapability),
    ),
  };
}

export function requirePlatformCapability(
  context: PlatformContext | null,
  capability: PlatformCapability,
): PlatformContext {
  if (!isPlatformCapability(capability) || !context || !context.capabilities.has(capability)) {
    throw new PlatformForbiddenError();
  }
  return context;
}
