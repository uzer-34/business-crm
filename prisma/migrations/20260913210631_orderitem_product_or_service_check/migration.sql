-- OrderItem must reference exactly one of (productId) or (serviceId), never
-- both and never neither. Prisma's schema DSL can't express a multi-column
-- CHECK constraint, so this is hand-written; createOrderAction validates
-- the same rule at the application layer, but this is the backstop against
-- any future write path that forgets to.
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_product_xor_service"
  CHECK (
    ("productId" IS NOT NULL AND "serviceId" IS NULL)
    OR
    ("productId" IS NULL AND "serviceId" IS NOT NULL)
  );
