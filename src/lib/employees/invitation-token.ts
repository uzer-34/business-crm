import { createHash, randomBytes } from "node:crypto";

const MIN_INVITATION_TTL_HOURS = 1;
const MAX_INVITATION_TTL_HOURS = 24 * 30;

export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Invitation expiry is deployment-configured because the product has not set
 * a fixed duration. Invalid or missing values fail closed instead of creating
 * invitations that never expire.
 */
export function getInvitationExpiry(now = new Date()): Date | null {
  const configuredHours = process.env.EMPLOYEE_INVITATION_TTL_HOURS;
  if (!configuredHours || !/^\d+$/.test(configuredHours)) return null;

  const ttlHours = Number(configuredHours);
  if (
    !Number.isSafeInteger(ttlHours) ||
    ttlHours < MIN_INVITATION_TTL_HOURS ||
    ttlHours > MAX_INVITATION_TTL_HOURS
  ) {
    return null;
  }

  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}
