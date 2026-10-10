-- Purchase order payments become auditable transactions. Existing
-- PurchaseOrder.amountPaid values stay intact; their historical method and
-- date were not recorded, so no synthetic payment rows are created.
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_payments_purchaseOrderId_createdAt_idx"
    ON "supplier_payments"("purchaseOrderId", "createdAt");

ALTER TABLE "supplier_payments"
    ADD CONSTRAINT "supplier_payments_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
    ADD CONSTRAINT "supplier_payments_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Direct order payments are used before an invoice exists. Keep them as
-- auditable financial events and import existing order payment audit events
-- with their original timestamps. The old UI did not capture method, so
-- historical events use OTHER rather than inventing payment details.
CREATE TABLE "order_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_payments_organizationId_createdAt_idx"
    ON "order_payments"("organizationId", "createdAt");
CREATE INDEX "order_payments_orderId_createdAt_idx"
    ON "order_payments"("orderId", "createdAt");

ALTER TABLE "order_payments"
    ADD CONSTRAINT "order_payments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_payments"
    ADD CONSTRAINT "order_payments_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_payments"
    ADD CONSTRAINT "order_payments_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "order_payments" (
    "id", "organizationId", "orderId", "amount", "method", "reference", "recordedByUserId", "createdAt"
)
SELECT
    'legacy_' || audit."id",
    order_row."organizationId",
    order_row."id",
    CASE WHEN audit."action" = 'order.payment_refunded'
      THEN -((audit."metadata"->>'amount')::DECIMAL(12,2))
      ELSE (audit."metadata"->>'amount')::DECIMAL(12,2)
    END,
    'OTHER'::"PaymentMethod",
    NULL,
    audit."actorUserId",
    audit."createdAt"
FROM "audit_logs" AS audit
JOIN "orders" AS order_row ON order_row."id" = audit."targetId"
WHERE audit."action" IN ('order.payment_recorded', 'order.payment_refunded')
  AND audit."targetType" = 'Order'
  AND audit."actorUserId" IS NOT NULL
  AND audit."metadata" ? 'amount';
