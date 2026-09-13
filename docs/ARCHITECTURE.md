# Architecture

This is a web-first, international, multi-tenant Business Management CRM /
Business Operating System. It is a separate, independent product from any
other project — no code is imported from elsewhere.

The full product vision, phase roadmap, and non-negotiables (RBAC, tenant
isolation, no fake integrations, etc.) live in the master brief this
repository was built from. This document tracks what actually exists and how
the pieces fit together, so it stays a map of the real codebase rather than
a restatement of intent.

## Core principle: generic core + industry intelligence

```
Organization
    ↓
Industry (industryKey)
    ↓
Industry Configuration (terminology, workflows, dashboards, ...)
```

Phase 1 only implements the generic core and a code-level industry
**registry** (`src/lib/industry/registry.ts`) — a label list an org picks
from at creation time. No industry-specific terminology, workflow, or
dashboard adaptation exists yet; that is Phase 10 (Industry Engine) and
Phase 11+ (per-industry modules). Building those now, before the core is
solid, would mean hardcoding `if (industryKey === "...")` branches
throughout the app — exactly what the brief rules out.

## Tenancy model

```
User
 └── Membership (status, role, allBranches)
      └── Organization
           └── Branch
```

- **User** authenticates with phone and/or email; no password.
- **Membership** is the only link between a User and an Organization, and
  carries the user's Role and branch scope for that organization. A user can
  hold memberships in multiple organizations (not yet exposed in the UI — see
  "Known gaps" below).
- **Organization** stores country/currency/timezone/locale/industry — see
  "International-first" below.
- **Branch** is a physical location under an Organization.

Every server-side query that touches tenant data must resolve the caller's
`organizationId` via `loadTenantContext(userId, organizationId)`
(`src/lib/rbac/guard.ts`), which re-derives membership from the database.
**Never** trust an `organizationId` read from a request body, query string,
or client state as proof of authorization — it is only ever used to look up
whether an ACTIVE membership actually exists for that user.

## RBAC

`Role` and `Permission` are real tables, not string literals:

- **Permission** is a single global catalog, seeded from
  `src/lib/rbac/permissions.ts` via `npm run db:seed`. It is shared by every
  organization — the set of things the product can check is defined in code,
  once.
- **Role** is per-organization. `createOrganizationForUser` seeds three
  system roles (Owner, Manager, Employee) from `SYSTEM_ROLES` in the same
  file, wired to that organization's copy of the permission catalog via
  `RolePermission`. Owners will be able to create custom roles later
  (`roles.manage` permission exists for this; the UI does not yet).
- Branch scope is explicit per membership: `allBranches = true` (set for
  Owner/Manager) grants every branch; otherwise access is limited to rows in
  `MembershipBranch`. `assertBranchAccess()` enforces this — it is not
  currently called by any route because no branch-scoped data model
  (customers, inventory, etc.) exists yet. Wire it in as soon as one does.
- Every mutation must call `requirePermission(ctx, "namespace.action")`.
  Hiding a button in the UI is not authorization.

## Authentication

Passwordless, phone or email, OTP-based:

- `src/lib/auth/otp.ts` — code generation, hashing (SHA-256, never stored in
  plaintext), single-use, expiry (10 min), attempt limits (5), resend
  cooldown (60s), and rate limiting per-target and per-IP (DB-query based;
  no Redis dependency yet — fine at current scale, revisit if it becomes a
  bottleneck).
- `src/lib/auth/otp-provider.ts` — `OtpProvider` interface with a
  `ConsoleOtpProvider` (prints the code server-side) as the only
  implementation. Swapping in Twilio/MSG91/SES/etc. means implementing this
  interface — auth business logic never changes.
- Sessions are opaque random tokens; only their SHA-256 hash is stored
  (`Session.tokenHash`), so a database leak doesn't yield live sessions. The
  cookie is `httpOnly`, `sameSite=lax`, and `secure` in production.
- `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) redirects
  unauthenticated requests to `/login`. It only checks cookie *presence* for
  routing; actual verification happens in `getCurrentUser()` on the server.

## International-first

No hardcoded currency, country, or tax assumptions:

- `Organization.countryCode` — ISO 3166-1 alpha-2
- `Organization.currencyCode` — ISO 4217
- `Organization.timezone` — IANA timezone (validated via `Intl.DateTimeFormat`)
- `Organization.locale` — BCP-47
- `User.phone` — E.164, validated with `libphonenumber-js`
- All timestamps are stored `timestamptz` (UTC) and rendered in the org's
  timezone at the presentation layer (not yet implemented — Phase 1 UI
  shows raw counts, no formatted dates yet).

## Audit log

`AuditLog` is a flat, append-only table (`organizationId` nullable for
pre-org events like OTP requests). Actions used so far:
`auth.otp_requested`, `auth.login`, `organization.created`,
`branch.created`. Extend the list as new mutations ship — it is a free-text
`action` field on purpose (see the file's own comment) so it doesn't need a
migration per new event type.

## Customer 360 & the universal activity timeline (Phase 2)

- **Customer** (`src/lib/validation/customer.ts`, `src/lib/customer/`) holds
  only generic fields (§17) — individual or business, contact info, status,
  source, tags, assignment. Industry-specific data (vehicle info, garment
  size, ...) does not belong here; it lands in future per-industry modules
  that reference a Customer, not fields added to it.
- **Activity** (`src/lib/customer/activity.ts`) is the user-facing business
  timeline shown on a customer's page (§18) — deliberately separate from
  `AuditLog`, which is the security/compliance trail and never rendered to
  end users. It's subject-polymorphic (`subjectType`/`subjectId`) so later
  modules (Sales, Orders, ...) can append events without a schema change;
  `customerId` is kept as a real FK for the common case so Customer 360 can
  query it directly with cascade delete. `summarizeActivity()`
  (`src/lib/customer/activity-summary.ts`) turns a raw event into display
  text — extend it alongside any new `type` string.
- **Note** and **Task** are child records of Customer. They reuse the
  `customers.edit` permission rather than getting their own permission keys
  — revisit this once either needs independent access control (e.g. a
  "notes are visible to everyone, editable only by the author" rule).
- Every mutation (`src/lib/customer/actions.ts`,
  `notes-actions.ts`, `tasks-actions.ts`) re-derives its tenant context from
  the row being touched, not from a client-supplied organizationId — see
  `loadCustomerContext()` for the pattern.

## Catalog: Products, Services, Categories, variants (Phase 3)

- **Category** (`src/lib/catalog/category.ts`) is shared infrastructure for
  both Products and Services, disambiguated by `kind`. There's no dedicated
  category management screen — `findOrCreateCategory()` is called inline
  from the product/service create forms (case-insensitive match within
  `(organizationId, kind)` so "Parts" and "parts" don't become two rows).
  Revisit with a real management UI once categories need edit/archive/reorder.
- **Product** (§19) holds only generic catalog fields — name, SKU, barcode,
  brand, unit, cost/selling price, a flat `taxRatePercent`. No supplier
  reference yet (Supplier doesn't exist until Phase 5); no inventory
  quantity (Phase 4 owns stock levels, keyed off Product/ProductVariant).
  Industry-specific fields (vehicle compatibility, fabric, ...) do not
  belong on this model — see `ProductVariant.attributes` or a future
  per-industry module.
- **ProductVariant** is deliberately just the "foundation" the brief asks
  for: a schemaless `attributes` JSON bag (e.g. `{"size": "M"}`) and
  optional price overrides that fall back to the parent Product. It is
  *not* wired into inventory or sales yet — those come in Phase 4/6 and will
  transact against `ProductVariant` once it exists. A product with zero
  variants is sold directly on its own SKU/price.
- **Service** (§20) mirrors Product's shape minus SKU/variants, plus
  `durationMinutes`.
- Money fields are `Decimal(12,2)` (never `Float` — avoids floating-point
  drift on currency math) and rendered with `formatMoney()`
  (`src/lib/format.ts`), which uses the organization's own `currencyCode`
  and `locale` — never a hardcoded `$`.

### Permission catalog evolution

Adding `products.*`/`services.*` to `PERMISSION_CATALOG` only creates new
`Permission` rows and grants them to *new* organizations (system roles are
seeded from `SYSTEM_ROLES` once, at org-creation time). `prisma/seed.ts`'s
`backfillSystemRolePermissions()` closes that gap: every time the seed runs,
it diffs each existing system role's grants against its `SYSTEM_ROLES`
template and adds whatever's missing — additive only, so it never revokes a
permission the catalog later drops (an org might be relying on a manual
grant). Verified by simulating a pre-Phase-3 org and confirming the reseed
brought its Owner role from 13 to the full 21-permission catalog. **Any
future permission catalog change should re-run `npm run db:seed` in every
environment**, not just apply the migration.

## Inventory (Phase 4)

A movement ledger, not a mutable quantity column, per the brief's explicit
formula in §21:

- **InventoryMovement** is an append-only log: every stock change is a row
  with a signed `quantityDelta` (positive = in, negative = out) and a
  `type` recording intent (`OPENING`, `ADJUSTMENT`, `TRANSFER_IN/OUT`,
  `DAMAGED` — plus `PURCHASE`/`SALE`/`RETURN`, reserved for Phase 5/6, which
  nothing in this phase creates yet). Never deleted or edited after the
  fact; a correction is a new movement, not a mutation.
- **StockLevel** is a materialized projection (current balance per
  branch/product/variant) kept in sync transactionally with every
  `InventoryMovement` insert (`applyStockMovement()` in
  `src/lib/inventory/stock.ts`) — the two can never drift, because nothing
  writes to `StockLevel` except that one function, and it always writes
  both rows in the same transaction. Verified directly against the ledger
  (`SUM(quantityDelta)` per branch matched `StockLevel.quantity` exactly
  after a mixed sequence of opening stock, a transfer, and a damage
  write-off).
- **variantKey**: Postgres unique indexes treat `NULL <> NULL`, so a
  nullable `variantId` can't anchor a real uniqueness constraint — two
  "no variant" rows for the same product wouldn't conflict and the
  projection would silently fork into duplicate balances. `variantKey` is
  always non-null (`""` for the base product, the variant's id otherwise)
  and is what the actual `@@unique([branchId, productId, variantKey])`
  constraint uses.
- Transfers create **two** movements (`TRANSFER_OUT` at the source,
  `TRANSFER_IN` at the destination) sharing a `transferGroupId`, in one
  transaction, after checking the source has enough stock. Any movement
  that would take a balance negative is rejected with "Insufficient stock"
  before either write happens.
- This is the first real caller of `assertBranchAccess()` (defined in
  Phase 1, unused until now — flagged as a known gap in every prior version
  of this doc). Both `recordMovementAction` and `transferStockAction` check
  it, and `transferStockAction` checks it for *both* branches. Verified
  directly against the guard's own query logic: an employee membership
  scoped to one branch (via `MembershipBranch`, `allBranches: false`) gets
  `hasBranchAccess = true` for its assigned branch and `false` for another
  branch in the same org. There's no UI yet to create such a membership
  (see "Known gaps") — this was verified at the data-access-logic level,
  not through a second logged-in browser session.
- **Low-stock alerts**: `Product.reorderPoint` (optional) plus a dashboard
  query (`loadLowStock()`) — deliberately minimal, no notifications, just a
  list next to the existing overdue-tasks one. Prisma can't compare two
  columns (`quantity` vs. `reorderPoint`) in a `where` clause, so this
  fetches candidates and filters in JS; fine at today's scale, worth a raw
  query or a maintained flag if the catalog grows large.
- **Client/server boundary pitfall caught during testing**: the inventory
  page originally passed full `Product` records (including `Decimal`
  fields) as props into the client-side movement/transfer forms. Prisma's
  `Decimal` is a Decimal.js instance, not a plain object, and React silently
  logs a "not supported" console error for every such prop instead of
  failing the build — it only surfaces by actually opening the page in a
  browser and watching the console, which is exactly why that's part of
  this project's verification step, not just `npm run check`. Fixed by
  mapping to a plain `{id, name, sku, variants}` shape before passing
  across the boundary (`productOptions` in `inventory/page.tsx`).

## Purchasing (Phase 5)

Supplier -> PurchaseOrder -> receiving -> Inventory -> supplier balance
(brief §22), built directly on top of Phase 4's ledger rather than beside it:

- **Supplier** is a plain org-scoped contact record. `Product.preferredSupplierId`
  (optional) is a convenience default for PO line items, not a constraint —
  a PO can still order any product from any supplier.
- **PurchaseOrder** gets an org-scoped sequential number (`PO-0001`, ...)
  minted from `Organization.poSequence`, atomically incremented inside the
  creation transaction (`{ poSequence: { increment: 1 } }`), so concurrent
  POs from the same org can't collide — Postgres serializes the row update.
- **No DRAFT/approval workflow.** A PO is live the moment it's created;
  brief §43 phases an approval-style flow into Phase 11's Automobile
  Workshop module specifically, not the generic core, so building one here
  would be exactly the kind of over-scoping §45 warns against.
- **Receiving has no separate "GoodsReceipt" header.** `InventoryMovement`
  already *is* the receipt record: `receivePurchaseOrderItemAction` calls
  the same `applyStockMovement()` from Phase 4 with `type: "PURCHASE"` and
  the real `purchaseOrderItemId` FK (upgraded from Phase 4's free-text
  `reference`, now that a real table exists to point to). A parallel
  "receipt" ledger would just be the same fact recorded twice. Partial
  receiving is supported — `quantityReceived` is cumulative, and the PO's
  own `status` (ORDERED -> PARTIALLY_RECEIVED -> RECEIVED) is recomputed
  from all its items after each receipt.
- **Payment status is a running total, not a ledger.** `amountPaid` +
  `paymentStatus` on the PO itself — deliberately not a full Payment model
  with methods/history (that's Phase 7). Overpayment is rejected
  server-side against the outstanding balance.
- Money math for PO totals uses `Prisma.Decimal` arithmetic
  (`new Prisma.Decimal(unitCost).times(qty)`, chained `.plus()`), not raw
  JS floats — avoids floating-point drift when summing many line items,
  same reasoning as why every price column is `Decimal` rather than `Float`.
- Same branch-scoping discipline as Phase 4: creating a PO checks
  `assertBranchAccess` for its branch, and receiving checks it again
  against the PO's own branch (never a client-supplied one).
- This phase's own line-item creation form doubles as a regression check
  for the Phase 4 client/server boundary lesson: `products`/`suppliers`
  passed into `NewPurchaseOrderForm` are pre-mapped to plain
  `{id, name, sku, variants}` shapes, never raw Prisma records with
  `Decimal` fields.

## Sales (Phase 6)

Customer -> Order -> Order Items -> Inventory -> Payment (brief §23),
deliberately mirroring Purchasing's lifecycle shape:

- **Order** supports a nullable `customerId` — a walk-in/point-of-sale sale
  doesn't require creating a Customer record first. Same
  ORDERED-style/no-draft reasoning as PurchaseOrder: no quote/cart workflow,
  an Order exists the moment it's created.
- **OrderItem** is the first model in this schema that references *two*
  different catalog types: a line is either a Product (optionally a
  variant) or a Service, never both, never neither. Prisma's schema DSL
  can't express that as a real constraint, so — same fix as the
  `variantKey` lesson in Phase 4 — a hand-written CHECK constraint
  (`order_items_product_xor_service`) was added via a follow-up migration
  (`prisma migrate dev --create-only`, then hand-edited) on top of
  `createOrderAction`'s own validation. Verified directly: a raw `INSERT`
  with neither `productId` nor `serviceId` set is rejected by Postgres,
  not just by the application.
- **Fulfillment, not creation, is what touches inventory** — same
  separation as Purchasing's receiving step. `fulfillOrderItemAction` calls
  Phase 4's `applyStockMovement()` with `type: "SALE"` and the real
  `orderItemId` FK (`InventoryMovement.reference`'s comment has been wrong
  twice now in the "not a real FK yet" direction — Phase 5 fixed it for
  purchasing, this fixes it for sales). **Service line items never call
  `applyStockMovement` at all** — fulfilling a service just increments
  `quantityFulfilled`, no stock check, no movement row. Verified in a real
  browser: fulfilling a Gift Wrapping service line left the branch's
  T-Shirt stock completely unchanged, while fulfilling the T-Shirt line
  moved it exactly as expected.
- The stock-sufficiency check moved *inside* the transaction
  (`getStockQuantity(tx, ...)` immediately before `applyStockMovement`),
  not before it — the first draft of this action checked stock with a
  separate pre-transaction query, which is the same race condition Phase 4
  deliberately avoided by checking inside the transaction. Caught and fixed
  during this phase's own code review, before it ever ran against real data.
- **Discounts are per-line, not per-order.** `discountPercent` reduces a
  line's subtotal before tax is calculated on the discounted amount —
  matches how real receipts compute tax on the post-discount price, not
  the list price.
- Same branch-scoping and Decimal-arithmetic discipline as Phase 5:
  `assertBranchAccess` on both create and fulfill; totals computed with
  `Prisma.Decimal`, never raw floats.
- Order placement appends to the **customer's own activity timeline**
  (`order.created`, shown as "Order placed: SO-0001") when the order has a
  customer — the first cross-module use of Phase 2's Activity model, closing
  the loop the brief's §18 examples always pointed at ("Product purchased").
- Closes a documented gap from Phase 2: Customer 360 now has a real
  **Orders tab** (brief §17 listed it from the start), including a
  "New order" shortcut that pre-selects the customer via
  `/orders/new?customerId=...`.
- RBAC differs from Purchasing on purpose: employees get
  `sales.create`/`sales.fulfill`, not just `sales.view`. Processing a sale
  is frontline checkout work a cashier does constantly; receiving a
  purchase order is comparatively rare back-office work. Same reasoning
  that already put `customers.create`/`edit` in the Employee role.

## Invoicing & Payments (Phase 7)

Order -> Invoice -> Payments (brief §24), the first phase to introduce a
real append-only financial ledger rather than a running-total field:

- **Invoice is derived from an Order, 1:1, not built independently.**
  `createInvoiceFromOrderAction` copies `subtotal`/`discountTotal`/`taxTotal`/
  `total` straight from the order and snapshots each line as a plain-text
  `InvoiceItem.description` (`"T-Shirt (TSH-001)"` or the service name) —
  an invoice is a financial record that must stay historically accurate
  even if the underlying Product/Service is later renamed or deleted, so
  `InvoiceItem` intentionally has no FK back to the catalog. Partial-order
  invoicing (invoicing only some lines of an order) is not built — out of
  scope until a real need for split invoices shows up.
- **`Payment` is a real ledger this time**, not another running total —
  append-only rows (`amount`, `method`, optional `reference`,
  `recordedByUserId`) — with `Invoice.amountPaid`/`paymentStatus` kept as a
  transactionally-updated cached projection, same
  ledger-plus-projection shape Phase 4 established for `InventoryMovement`
  → `StockLevel`. Verified directly in Postgres after a two-payment test
  (CASH then BANK_TRANSFER against one invoice): `SUM(payments.amount)`
  for the invoice matched `invoices.amountPaid` exactly, and
  `paymentStatus` moved UNPAID → PARTIALLY_PAID → PAID at the right
  thresholds.
- **Overpayment is rejected** — `recordInvoicePaymentAction` validates
  `amount <= outstanding` before inserting the ledger row, inside the same
  transaction that updates the cached total.
- **Voiding is blocked once money has moved**:
  `voidInvoiceAction` refuses to void an invoice with `amountPaid > 0`
  ("Cannot void an invoice with recorded payments") — verified in a real
  browser: recording a payment against an issued invoice and then clicking
  Void left the invoice unchanged with that exact error shown, rather than
  silently voiding a paid invoice.
- **`invoices.void` is deliberately excluded from the Employee system
  role** (manager+ only), same reasoning as `sales.cancel`/
  `purchases.cancel`: a cashier prints the receipt and takes the payment,
  but voiding an issued invoice is a back-office correction. Verified at
  the permission-catalog level (Employee's `SYSTEM_ROLES` entry has
  `invoices.view`/`invoices.create`/`payments.record` but not
  `invoices.void`) and via the UI's own permission gate
  (`canVoid = ctx.permissions.has("invoices.void")`); a live cross-role
  browser test isn't possible yet since there's still no employee
  invitation flow (see "Known gaps") to create a second, lower-privileged
  membership to test against.
- **Print view lives in its own route group** — `src/app/(print)/invoices/
  [id]/print/` is a sibling of `(app)/invoices/[id]/`, not nested under it,
  so it only inherits the root layout (fonts/globals) and not `(app)`'s
  sidebar/nav chrome, while still going through the same auth check in
  `src/proxy.ts` (path-based, not layout-based — an unauthenticated
  request to a print URL still redirects to `/login`, verified directly).
  Line amounts on the print view are computed with `Prisma.Decimal`, not
  raw JS floats, matching the money-math discipline used everywhere else.
- Dashboard gained a real **Outstanding invoices** section (oldest unpaid/
  partially-paid first) next to Low Stock and Needs Attention.
- Customer 360 gained a real **Invoices tab** — closes a gap flagged since
  Phase 6 added the Orders tab.
- Order detail page now shows either a "Generate invoice" button
  (`invoices.create` permission) or a link to the invoice that already
  exists for it — an order can only ever have one invoice in this phase.

## Motion (hover + scroll)

GSAP (`gsap`, `@gsap/react`) provides the product's hover and scroll
animation, per the design principle in §35 (restrained, purposeful — not
decorative). Reusable primitives live in `src/components/motion/`:

- `RevealOnScroll` — `ScrollTrigger.batch()` fade/slide-in for list-style
  content (customer list, notes, tasks, activity feed) as it scrolls into
  view. `once: true` so it doesn't replay on scroll-back.
- `StaggerIn` — the same fade/slide, triggered on mount instead of scroll,
  for above-the-fold content (dashboard stat tiles) that ScrollTrigger has
  nothing to trigger on.
- `HoverLift` — a subtle translateY + shadow lift on card hover, wired via
  `useGSAP`'s `contextSafe` with listeners attached/removed inside the
  effect (not via a `contextSafe(...)` call sitting in the render body —
  that pattern trips the React Compiler's `react-hooks/refs` lint rule even
  though it's GSAP's own documented idiom).

All three skip themselves under `prefers-reduced-motion` via
`gsap.matchMedia()`, and `HoverLift` also checks `(hover: hover)` so touch
devices don't get a stuck hover state. None of them run during SSR — they're
client components whose GSAP calls live inside `useGSAP`, which only
executes after mount.

## Stack

Next.js 16 (App Router, Turbopack, React 19.2) · TypeScript strict ·
Tailwind CSS v4 · Prisma 7 (via `@prisma/adapter-pg` + `pg`, not the legacy
built-in engine) · Zod v4 · PostgreSQL.

Next.js 16 changed several conventions from what most training data expects
(`middleware.ts` → `proxy.ts`, fully-async `cookies()`/`headers()`/`params`,
Turbopack by default). See `node_modules/next/dist/docs/` before assuming
Next.js 15-era patterns. Prisma 7 changed its default client output path,
config file, and the recommended way to construct `PrismaClient` — see
`.claude/skills/prisma-*` (installed by `prisma init`) before writing Prisma
code that doesn't match `src/lib/db.ts`.

## What exists today

**Phase 1 — Foundation**
- Passwordless OTP auth (phone + email), sessions, audit log
- Organization creation wizard (country/currency/timezone/locale/industry)
- Branch model + a real Branches page (list + create, permission-gated)
- RBAC: Permission catalog, per-org Role seeding, `requirePermission` guard
- PWA manifest + installable icons (no offline support — brief explicitly
  says not to fake this)

**Phase 2 — Customer 360**
- Customer list + detail page with Overview/Activity/Notes/Tasks tabs
- Notes, tasks (with due date, assignment, complete), customer assignment
- Universal activity timeline, auto-logged by every mutation above
- Dashboard "needs your attention" now shows real overdue/due-today tasks
  (previously a static empty state); stat tiles and lists have restrained
  hover/scroll motion (see "Motion" above)

**Phase 3 — Products, Services, Categories**
- Product list + detail page (SKU, brand, cost/selling price, category),
  with a variants section (ProductVariant foundation, not yet wired to
  anything downstream)
- Service list + create (price, duration, category)
- Categories created inline from either form (find-or-create, no dedicated
  management screen yet)
- Dashboard gained a real "Products" stat tile (replaced the "Open
  invoices" placeholder, which had no real data behind it until Phase 6/7)

**Phase 4 — Inventory**
- Movement-based stock ledger (`InventoryMovement`) with a materialized
  `StockLevel` projection kept transactionally in sync
- Inventory page: branch switcher (scoped to the caller's accessible
  branches), stock table with a low-stock indicator, record-movement
  (opening/adjustment/damaged) and transfer-between-branches dialogs,
  recent movements list
- First real use of `assertBranchAccess()` from Phase 1 — closes that gap
- Dashboard gained a real "Low stock" section next to the tasks one

**Phase 5 — Suppliers & Purchasing**
- Supplier list + create
- Purchase order creation (dedicated page, dynamic line items) with an
  org-scoped sequential order number
- Receiving (partial or full) that creates real `PURCHASE` movements —
  the first thing to use the movement types Phase 4 reserved for this
- Payment status tracking (running total, not a full ledger)
- `InventoryMovement.purchaseOrderItemId` real FK, upgraded from Phase 4's
  free-text `reference` now that a real table exists to point to
- `Product.preferredSupplierId` — closes a gap flagged since Phase 3

**Phase 6 — Sales**
- Order creation (dedicated page, mixed product/service line items with
  per-line discount and tax) with an org-scoped sequential order number
- Fulfillment (partial or full) creating real `SALE` movements for product
  lines; service lines fulfill without touching inventory at all
- Hand-written CHECK constraint enforcing OrderItem's product-xor-service
  invariant at the database level, not just in application code
- Payment status tracking, same running-total pattern as Purchasing
- Customer 360 gained a real Orders tab — closes a gap flagged since Phase 2
- Order creation logs to the customer's own activity timeline

**Phase 7 — Invoicing & Payments**
- Invoice generation from a fulfilled order (1:1, org-scoped sequential
  invoice number), with line items snapshotted as plain text so they stay
  accurate if the catalog changes later
- Real append-only `Payment` ledger (method, optional reference, recorded
  by) with `Invoice.amountPaid`/`paymentStatus` as a transactionally-kept
  cached projection — verified against the raw ledger sum in Postgres
- Overpayment rejected; voiding rejected once any payment is recorded
- Print-friendly invoice view in its own route group (no sidebar chrome),
  still behind the same auth check as every other page
- Dashboard gained a real Outstanding invoices section; Customer 360
  gained a real Invoices tab — closes a gap flagged since Phase 6

## Known gaps / deliberately not built yet

- No organization switcher — a user with multiple orgs always lands on the
  first membership found (`getDefaultMembershipOrRedirect`)
- No employee invitation flow — an Owner exists (the org creator); there is
  no UI yet to invite a second Membership
- No custom-role UI (the `roles.manage` permission exists, unused)
- Customer still has an optional `branchId` that nothing enforces —
  `assertBranchAccess()` is now real (see "Inventory" above) but not yet
  applied to Customer reads/writes
- No customer edit/archive UI yet (create + assign only); no search/filter
  on the customer list beyond the default sort
- Notes/Tasks have no dedicated permission keys — see "Customer 360" above
- No product/service edit or archive UI yet (create-only, matching the
  Customer/Branch pattern so far); no dedicated Category management screen
- No per-product movement history page — the inventory page shows the last
  20 movements for the whole branch, not filtered per product
- No PO edit/cancel UI yet (`purchases.cancel` permission exists, unused);
  no supplier edit/archive UI (create-only, matching every other module)
- No supplier balance report — the outstanding-per-PO figure exists, but
  nothing rolls it up across all of a supplier's purchase orders yet
- `RETURN` exists as an `InventoryMovementType` value but nothing creates
  it yet; no order edit/cancel UI (`sales.cancel` permission exists, unused)
- No order-level discount, only per-line — fine for now, revisit if a
  storewide/cart-level discount becomes a real requirement
- No partial-order invoicing — an invoice always covers a whole order;
  revisit if a real need for split invoices shows up
- No invoice edit UI (create/void/pay only); no credit note / refund flow
- `invoices.void` cross-role enforcement is verified at the permission
  catalog and UI-gate level only — a live two-membership browser test
  needs the employee invitation flow (still not built, see above)
- Expenses, the Industry Engine, AI Business Intelligence — later phases
  per the roadmap, not started
- Rate limiting is DB-query based, not a dedicated store; fine for now, but
  the first thing to revisit if abuse patterns show up in production traffic

## Phase roadmap

Phase 1 (this): Foundation — auth, org/branch/membership, RBAC, PWA.
Phase 2: Customer 360. Phase 3: Products/Services. Phase 4: Inventory.
Phase 5: Suppliers/Purchasing. Phase 6: Sales/Orders. Phase 7:
Invoices/Payments. Phase 8: Expenses/Financial reporting. Phase 9:
Employees/Tasks/Workflows/Notifications. Phase 10: Industry Engine.
Phase 11: Automobile Workshop (first deep industry module). Phase 12:
Clothing/Retail. Phase 13: AI Business Intelligence. Phase 14: Additional
industry packs.
