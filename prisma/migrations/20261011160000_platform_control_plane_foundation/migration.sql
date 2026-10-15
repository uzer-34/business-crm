-- Platform control-plane identity and audit tables. This migration is
-- intentionally not applied by this change; deployment still requires the
-- repository's Gate 0 evidence and explicit production approval.

CREATE TYPE "PlatformPrincipalStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "platform_principals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PlatformPrincipalStatus" NOT NULL DEFAULT 'DISABLED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_principals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_grants" (
    "id" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "grantedByPrincipalId" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByPrincipalId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "actorPrincipalId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_principals_userId_key" ON "platform_principals"("userId");
CREATE UNIQUE INDEX "platform_grants_principalId_capability_key" ON "platform_grants"("principalId", "capability");
CREATE INDEX "platform_grants_capability_revokedAt_idx" ON "platform_grants"("capability", "revokedAt");
CREATE INDEX "platform_audit_logs_actorPrincipalId_createdAt_idx" ON "platform_audit_logs"("actorPrincipalId", "createdAt");
CREATE INDEX "platform_audit_logs_targetType_targetId_createdAt_idx" ON "platform_audit_logs"("targetType", "targetId", "createdAt");

ALTER TABLE "platform_principals"
    ADD CONSTRAINT "platform_principals_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_grants"
    ADD CONSTRAINT "platform_grants_principalId_fkey"
    FOREIGN KEY ("principalId") REFERENCES "platform_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_grants"
    ADD CONSTRAINT "platform_grants_grantedByPrincipalId_fkey"
    FOREIGN KEY ("grantedByPrincipalId") REFERENCES "platform_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_grants"
    ADD CONSTRAINT "platform_grants_revokedByPrincipalId_fkey"
    FOREIGN KEY ("revokedByPrincipalId") REFERENCES "platform_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_actorPrincipalId_fkey"
    FOREIGN KEY ("actorPrincipalId") REFERENCES "platform_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
