-- Local source migration only. Do not apply to Neon production without Gate 0
-- evidence and explicit deployment approval.

ALTER TABLE "platform_audit_logs"
  ALTER COLUMN "actorPrincipalId" DROP NOT NULL,
  ADD COLUMN "actorExternalReference" TEXT;

ALTER TABLE "platform_audit_logs"
  ADD CONSTRAINT "platform_audit_logs_exactly_one_actor_check"
  CHECK (("actorPrincipalId" IS NOT NULL) <> ("actorExternalReference" IS NOT NULL));

CREATE TABLE "platform_bootstrap_authorizations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "operatorReference" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "revokedByReference" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_bootstrap_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_bootstrap_authorizations_tokenHash_key"
  ON "platform_bootstrap_authorizations"("tokenHash");
CREATE INDEX "platform_bootstrap_authorizations_expiresAt_consumedAt_idx"
  ON "platform_bootstrap_authorizations"("expiresAt", "consumedAt");

ALTER TABLE "platform_bootstrap_authorizations"
  ADD CONSTRAINT "platform_bootstrap_authorizations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "PlatformPurchaseKind" AS ENUM ('LIFETIME', 'SUBSCRIPTION', 'INSTALLMENT');
CREATE TYPE "PlatformBillingIntervalUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');
CREATE TYPE "PlatformEntitlementState" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "PlatformScheduleKind" AS ENUM ('LIFETIME_PAYMENT', 'SUBSCRIPTION_CYCLE', 'INSTALLMENT');
CREATE TYPE "PlatformScheduleStatus" AS ENUM ('OPEN', 'CANCELED');
CREATE TYPE "PlatformPaymentDirection" AS ENUM ('RECEIPT', 'REFUND');
CREATE TYPE "PlatformPaymentStatus" AS ENUM ('PENDING', 'SETTLED', 'FAILED', 'VOIDED');

CREATE TABLE "platform_purchases" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" "PlatformPurchaseKind" NOT NULL,
  "contractAmount" DECIMAL(12,2) NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL,
  "billingIntervalUnit" "PlatformBillingIntervalUnit",
  "billingIntervalCount" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_entitlements" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "state" "PlatformEntitlementState" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "platform_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_billing_schedule_items" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "kind" "PlatformScheduleKind" NOT NULL,
  "sequence" INTEGER NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL,
  "status" "PlatformScheduleStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_billing_schedule_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_payments" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "scheduleItemId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "direction" "PlatformPaymentDirection" NOT NULL,
  "status" "PlatformPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(12,2) NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL,
  "externalReference" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_entitlements_purchaseId_key"
  ON "platform_entitlements"("purchaseId");
CREATE INDEX "platform_purchases_organizationId_createdAt_idx"
  ON "platform_purchases"("organizationId", "createdAt");
CREATE UNIQUE INDEX "platform_billing_schedule_items_purchaseId_sequence_key"
  ON "platform_billing_schedule_items"("purchaseId", "sequence");
CREATE UNIQUE INDEX "platform_billing_schedule_items_purchaseId_id_key"
  ON "platform_billing_schedule_items"("purchaseId", "id");
CREATE INDEX "platform_billing_schedule_items_dueAt_status_idx"
  ON "platform_billing_schedule_items"("dueAt", "status");
CREATE INDEX "platform_payments_purchaseId_createdAt_idx"
  ON "platform_payments"("purchaseId", "createdAt");
CREATE INDEX "platform_payments_scheduleItemId_createdAt_idx"
  ON "platform_payments"("scheduleItemId", "createdAt");

ALTER TABLE "platform_purchases"
  ADD CONSTRAINT "platform_purchases_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_entitlements"
  ADD CONSTRAINT "platform_entitlements_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "platform_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_billing_schedule_items"
  ADD CONSTRAINT "platform_billing_schedule_items_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "platform_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_payments"
  ADD CONSTRAINT "platform_payments_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "platform_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_payments"
  ADD CONSTRAINT "platform_payments_purchaseId_scheduleItemId_fkey"
  FOREIGN KEY ("purchaseId", "scheduleItemId")
  REFERENCES "platform_billing_schedule_items"("purchaseId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_payments"
  ADD CONSTRAINT "platform_payments_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "platform_principals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
