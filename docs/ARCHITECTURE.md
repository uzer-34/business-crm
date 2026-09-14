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

## Expenses & Financial Reporting (Phase 8)

Money going out, and the first cross-module report (brief §25):

- **`Expense` reuses `Category` rather than introducing an `ExpenseCategory`
  model** — `CategoryKind` gained an `EXPENSE` value alongside `PRODUCT`/
  `SERVICE`, and `findOrCreateCategory()` (Phase 3) was widened to accept
  it. Same inline find-or-create UX as Products/Services, same
  case-insensitive match — verified in a real browser: entering "Rent"
  then "rent" on two different expenses resolved to the same Category row,
  not two.
- **`method` reuses `PaymentMethod`** (Phase 7's enum) rather than a new
  one — an expense payment method is the same concept as an invoice
  payment method, no reason to duplicate the enum.
- **Void, not delete** — same "correction, not erasure" discipline as
  Invoice: a mistaken entry becomes `status: VOID` (with `voidedAt` set),
  never removed, so the audit trail and any past report that already
  counted it stay explainable. `expenses.void` is manager+ only, same
  reasoning as `invoices.void`/`sales.cancel`: an employee can record a
  petty-cash expense as frontline work, but voiding one after the fact is
  a back-office correction.
- **Branch-scoped** like every other transactional model — `assertBranchAccess`
  on create, `branchId` required (not optional): an expense always belongs
  to a specific branch's books, unlike a walk-in Order's optional customer.
- **The financial summary lives on the Expenses page itself, gated behind
  `reports.financial`**, rather than a separate `/reports` route or a
  dashboard card — this phase's only report is "this month's revenue
  (issued invoices) minus expenses," and putting it where expenses are
  already being reviewed avoided a second page for one number. Revenue is
  `SUM(Invoice.total)` for non-void invoices issued this calendar month;
  expenses is `SUM(Expense.amount)` for non-void expenses incurred this
  calendar month — both computed with `Prisma.Decimal`, not raw floats.
  A dedicated reports section can split out if more reports get added
  later; one card wasn't worth the extra route yet.
- **Found and fixed during this phase's own verification**: the expense
  list originally sorted by `incurredAt` alone, but `incurredAt` only
  carries date precision (the form is a plain date input) — two expenses
  logged on the same day landed with an *identical* timestamp, making
  their relative order in the list unstable across queries. A real
  browser test caught this directly: voiding "the last expense in the
  list" voided the wrong one. Fixed by adding `createdAt: "desc"` as a
  secondary sort key, so same-day expenses now stay ordered
  most-recently-entered-first.

## Employees, Tasks & Notifications (Phase 9)

This phase closes the biggest standing gap in the project — there was no
way to add a second person to an organization — and gives the Task model
(built in Phase 2, customer-scoped only) a general, org-wide home.

- **No separate invite-link/email system was built.** An "invite" is
  administrative only: `inviteEmployeeAction` upserts a `User` row by
  email/phone and creates a `Membership` with `status: INVITED` pointing
  at it. There is nothing to click — the invited person just goes to the
  ordinary `/login` page and requests an OTP the normal way. The hook that
  makes this work lives in `verifyOtpAction` (Phase 1's login action):
  right after resolving the `User`, it flips any of that user's `INVITED`
  memberships to `ACTIVE` (`joinedAt: now`) before the session is created.
  This matches brief §45/§41 — no fake email-delivery system, no
  unclickable "invite link" — and was the only design that made sense once
  passwordless OTP is *already* the entire signup mechanism: a second
  invite flow would have been a parallel, redundant path into the same
  User/Session tables.
- **Privilege-escalation guard**: `employees.manage` (held by both Manager
  and Owner) would otherwise let a Manager invite — or promote — someone
  into the *Owner* role, handing them more power than the Manager granting
  it. `requireOwnerToGrantOwner()` blocks assigning the `owner` role key
  unless the caller's own role is already Owner. The Employees page's UI
  also hides "Owner" from the role dropdown for non-Owners, but the real
  boundary is server-side — verified by reading both call sites
  (`inviteEmployeeAction`, `changeEmployeeRoleAction`), the same "UI hides
  it, server also enforces it" discipline used for `invoices.void` /
  `expenses.void` elsewhere.
- **Suspend, not delete** — `suspendEmployeeAction`/`reactivateEmployeeAction`
  toggle `Membership.status` between `ACTIVE`/`SUSPENDED`; a suspended
  membership simply stops being found by `loadTenantContext` (which only
  matches `status: "ACTIVE"`) and by `getDefaultMembershipOrRedirect`. A
  suspended person can still log in (their `User`/`Session` are untouched)
  but lands on `/onboarding` — the same code path a brand-new user takes,
  since "no active membership anywhere" looks identical either way. You
  cannot suspend yourself (checked against `ctx.membershipId`).
- **This is the project's first real, live, cross-role browser test.**
  Every previous phase's manager-vs-employee permission claims (Phase 7's
  `invoices.void`, Phase 8's `expenses.void`/`reports.financial`) had been
  verified only by reading the permission catalog, because there was no
  way to actually create a second logged-in user in the same org. Phase 9
  finally did this for real: invited an Employee-role membership scoped to
  one specific branch (not `allBranches`), logged in as that person, and
  confirmed in a live browser that (a) their first login activates the
  membership and lands on the dashboard rather than onboarding, (b) the
  Inventory page's branch switcher shows only the one branch they were
  scoped to and never the org's other branch, and (c) `/employees` shows a
  permission-denied message rather than the page (Employee has no
  `employees.view`). This also finally exercises `assertBranchAccess`
  end-to-end instead of at the data-access-logic level only, closing a
  verification gap noted since Phase 4.
- **Standalone tasks**: `Task.customerId` was already nullable (Phase 2),
  so no schema change was needed — only a new creation path
  (`createStandaloneTaskAction`, gated on the new `tasks.create` rather
  than `customers.edit`) and a `/tasks` page (My tasks / Team tasks,
  the latter gated on `tasks.view`). `completeTaskAction` was generalized
  so the person a task is assigned to can always mark it done regardless
  of role — only completing *someone else's* task needs a permission
  (`customers.edit` for a customer-linked task, `tasks.edit` otherwise).
- **Notifications are in-app only** (brief §45: no fake channel) — a
  `Notification` row is a real fact the recipient sees in the header bell,
  full stop, no email/push claimed. `notifyMembership()` is the single
  write path, called from `assignCustomerAction` (Phase 2) and both task
  creation actions; it silently no-ops when you'd notify yourself (e.g.
  assigning a task to your own membership). Verified in a real browser:
  assigning a task and a customer to the same employee produced exactly
  two unread notifications, each linking to the right page, and "mark all
  read" cleared the header badge.
- **Deliberately not built**: a generic workflow engine. The roadmap names
  this phase "Employees/Tasks/**Workflows**/Notifications," but the only
  "workflow" that exists anywhere in the app today is a task's
  OPEN→DONE transition, which already worked before this phase. Building
  a configurable, industry-agnostic workflow engine now — before Phase 10
  (Industry Engine) has even defined what an industry-specific process
  looks like — would be designing an abstraction with no real consumer
  yet, which is exactly what brief §45 says not to do. Custom roles
  (`roles.manage`, seeded since Phase 1, still unused) were left for the
  same reason: a role-permission editor is a real feature, but nothing in
  this phase needed it yet, and the invite flow only ever assigns one of
  the three fixed system roles.

## Industry Engine (Phase 10)

This is where "generic core + industry intelligence" (the architecture
principle stated at the top of this document) stops being a slogan and
becomes real code. The roadmap calls this phase "Industry Engine," but
deliberately does **not** mean industry-specific business modules — those
are Phase 11 (Automobile Workshop) and Phase 12 (Clothing/Retail). What
this phase builds instead is the two generic mechanisms those later phases
will build on:

- **A terminology engine** (`src/lib/industry/terminology.ts`). The
  underlying `Customer`/`Order` models never change — only what a handful
  of nav labels and page headers call them. `getTerminology(industryKey)`
  returns a small `Record<TermKey, string>` (currently just
  customer/customers/order/orders), defaulting to plain English and
  overridden per industry only where the generic noun would genuinely read
  strangely to that trade — an automobile workshop or repair shop calls an
  Order a "Job Card"; a salon calls a Customer a "Client"; a clinic calls
  one a "Patient"; a restaurant calls one a "Guest". Most of the
  `INDUSTRIES` list from Phase 1's stub (jewellery, electronics retail,
  furniture, distributor, professional services, construction, ...)
  intentionally has **no** entry here — "Customer"/"Order" already reads
  fine for them, and adding an override nobody asked for is exactly what
  brief §45 says not to do. Wired into the sidebar nav, the
  Customers/Orders page headers, and the dashboard's stat tile — verified
  live: switching an org from "generic" to "automobile_workshop" changed
  "Orders" to "Job Cards" everywhere immediately, while "Customers"
  correctly stayed as-is (no override defined for that industry).
- **A generic custom-fields framework** (`CustomFieldDefinition` +
  `CustomFieldValue`). Rather than adding a `vehiclePlateNumber` column to
  `Customer` for one industry, an org can define its own fields per entity
  type. `CustomFieldValue.entityId` is polymorphic (a free-standing id, not
  a real FK) — the same tradeoff Activity's `subjectId` already made in
  Phase 2, for the same reason: one physical table can't cleanly FK to
  every possible entity table. `CustomFieldEntityType` deliberately starts
  with only `CUSTOMER` — the one entity this phase wires all the way
  through (definition management in Settings, dynamic rendering in the
  create form, display + inline editing on Customer 360) to prove the
  mechanism actually works before anything else depends on it. Adding
  `ORDER` or a Phase-11-specific entity later is one additive enum value,
  not a redesign.
- **Definitions are seeded by a person, not a "pack" system, for now.**
  The comment in the schema notes that Phase 11/12's industry packs are
  expected to eventually *auto-seed* sensible default fields for their
  vertical (a workshop org getting "Vehicle plate number" for free rather
  than an owner typing it in) — building that seeding mechanism now, before
  those packs exist to seed anything, would be the same "designing an
  abstraction with no real consumer" mistake Phase 9 already called out for
  a workflow engine. So for this phase, defining fields is a manual,
  Owner-only action on the new **Settings** page.
- **`organization.manage`** (seeded since Phase 1, unused until now) gates
  both the industry switch and custom-field definition management — a
  structural decision about what the business tracks belongs with the
  Owner, not Manager, even though Manager already holds several other
  "manage"-shaped permissions elsewhere. *Setting a value* on an existing
  field, by contrast, uses whatever permission already governs editing
  that entity (`customers.edit` for Customer) — that's ordinary data entry,
  not a structural change, so it stays governed by the existing lower bar.
- No org existed with a way to change its industry after onboarding until
  this phase — the Settings page's industry selector closes that gap
  incidentally while giving the terminology engine something to switch.
- Verified in a real browser end-to-end: created an org as "generic",
  confirmed plain "Customers"/"Orders" everywhere, switched industry to
  "automobile_workshop" via Settings, confirmed the nav and Orders page
  header changed to "Job Cards" live (no re-login needed — it's just a
  server component re-render), defined a TEXT field ("Vehicle plate
  number") and a SELECT field ("Vehicle type": Sedan/SUV/Truck), created a
  customer filling both in, and confirmed the values round-tripped through
  Postgres and displayed correctly (and editably) on Customer 360.
  `organization.manage` being Owner-only is verified at the permission
  catalog level, same standing caveat as other manager-only gates until a
  cheap way to spin up a second membership inline exists for every check.

## Automobile Workshop (Phase 11)

The first deep industry module — where Phase 10's generic mechanisms
finally get a real consumer, and where the brief's "generic core"
half of the principle earns a genuine exception.

- **`Vehicle` is a real model, not a custom field.** Phase 10's
  `CustomFieldDefinition` framework was deliberately left as the generic
  mechanism; a workshop's vehicle needed something a JSON key-value pair
  couldn't give it — its own identity with a real service history
  (`Order.vehicleId`), real indexed lookup by plate number, and a proper
  detail page. This is the intended shape of "industry intelligence" per
  the brief's core principle: a purpose-built entity when a vertical
  genuinely needs one, sitting *alongside* the generic Customer/Order core,
  not replacing it or forcing every other industry to carry its weight.
- **A Job Card is an Order, not a separate table.** `Order` gained two
  nullable, workshop-only fields — `vehicleId` and `odometerReading` — used
  by no other industry's orders. This mirrors the Phase 10 terminology
  engine's own philosophy: don't fork the generic pipeline just because
  one vertical calls the same thing something else. A workshop's job card
  has the exact same lifecycle as any other order (create → fulfill →
  invoice → pay), the exact same mixed product/service line items (parts =
  Product, labour = Service), and gets its "Job Card" label purely from
  Phase 10's terminology engine — no parallel workflow was built.
- **Visibility is industry-gated, not permission-gated.** `tracksVehicles
  (industryKey)` (a small explicit allowlist: `automobile_workshop` and
  `repair`) decides whether the "Vehicles" nav link, the Customer 360
  Vehicles tab, and the vehicle/odometer fields on the New Order form even
  render — regardless of what permissions the viewer holds. A jeweller's
  Owner has every permission in the catalog and still never sees a
  "Vehicles" anything, because it would be clutter for their business. This
  is a different axis from RBAC entirely: RBAC answers "is this person
  allowed," industry-gating answers "does this business even have this
  concept."
- `vehicles.view/create/edit/archive` follow the same Manager-gets-all,
  Employee-gets-view/create/edit split used everywhere else in the
  catalog — logging a customer's vehicle is frontline service-desk work,
  archiving one is a back-office correction.
- Verified in a real browser end-to-end: an org created as "generic"
  showed no Vehicles nav link at all; switching it to
  "automobile_workshop" via Settings made the nav link and the Customer
  360 Vehicles tab appear immediately; added a vehicle to a customer;
  created a Job Card selecting that vehicle and entering an odometer
  reading; confirmed the Job Card detail page showed both; and confirmed
  the vehicle's own detail page listed that Job Card in its service
  history with the correct odometer reading.

## Clothing / Retail (Phase 12)

The second industry pack, and a lighter one than Phase 11 — clothing
retail's core need (products with Size/Color combinations) was already
served by Phase 3's `ProductVariant`, so this phase is about making that
existing mechanism actually usable at retail scale, plus closing a gap
that's been sitting in the schema since Phase 4.

- **Bulk variant generator, not a new model.** Adding ten Size × Color
  combinations one at a time through Phase 3's single `AddVariantForm`
  doesn't scale to a real clothing catalog. `generateVariantMatrixAction`
  takes a comma-separated size list and color list and creates every
  combination in one call, deriving each SKU from the product's own SKU
  (`TEE-S-RED`). It's additive, not destructive: re-running it after adding
  a new size only creates what's missing — combinations whose derived SKU
  already exists are silently skipped, not treated as an error, so an
  owner can keep adding sizes/colors over time without tracking which
  ones they already generated. Verified in a real browser: generating
  S/M/L × Red/Blue created exactly 6 variants; immediately generating
  S/XL × Red on the same product created only the new XL/Red combination
  and reported the other as already existing, not a duplicate or a
  failure.
- **This is generic-core, not industry-gated**, unlike Phase 11's Vehicle
  module. Any product with variants benefits from bulk generation — a
  jeweller with ring sizes, an electronics store with storage-capacity
  SKUs — so the "Generate variants" button lives next to the existing
  one-at-a-time form for every industry, not just `clothing_retail`.
  Clothing retail is simply the phase whose real need motivated building
  it now.
- **Returns/exchanges finally use the `RETURN` movement type** — a value
  that's existed in `InventoryMovementType` since Phase 4 but nothing ever
  created (flagged as a known gap in every phase since). `OrderItem`
  gained `quantityReturned` (cumulative, always ≤ `quantityFulfilled`);
  `processReturnAction` restocks inventory through the same
  `applyStockMovement` ledger+projection helper every other movement uses,
  for product lines only (a returned service line just increments
  `quantityReturned` with no stock effect, mirroring how service
  fulfillment already skips inventory). A return does **not** change
  `Order.status` — the order genuinely was fulfilled; a post-fulfillment
  return is a separate lifecycle event layered on top, not an
  un-fulfillment.
- **Deliberately does not touch money.** `processReturnAction` never
  reverses `Order.amountPaid`, `Invoice`, or `Payment` state. A real refund
  or exchange-credit flow is a genuine feature (a credit note, a cash
  drawer transaction, store-credit issuance) that this phase intentionally
  leaves as a manual follow-up rather than guessing at a refund policy no
  one asked for — brief §46 says a feature isn't complete until
  functionality *and* every other dimension is actually addressed, and
  silently mutating payment state with no real refund flow behind it would
  fail that bar, not meet it. Documented explicitly below rather than left
  as a silent gap.
- `sales.return` was added to the permission catalog (Manager and Employee
  both get it — processing a return at the counter is frontline work, same
  as the original sale; `sales.cancel` remains the only manager-only
  action in this category).
- Verified end-to-end in a real browser: stocked a generated variant,
  created an order for 5 units, fulfilled all 5, processed a return of 2
  (inventory correctly went 10 → 5 after fulfillment → 7 after the
  return, and the order item showed "5 / 5 fulfilled · 2 returned" while
  the order stayed FULFILLED), then confirmed the server rejects
  returning more than what's still outstanding (3) even when the
  browser's own `max` attribute on the quantity input is bypassed —
  proving the real guard lives in `processReturnAction`, not just in the
  form's UI.

## AI Business Intelligence (Phase 13)

This phase's name invites a specific mistake: building an "AI" feature
that's really just canned text dressed up as a model's output. Brief §45
("don't fake it") rules that out explicitly, so this phase is split into
two honestly-separated halves.

- **Real analytics, no AI required for this half.** `src/lib/analytics/
  reports.ts` computes four real things from data that already exists —
  a 6-month revenue trend (from issued Invoices), top 5 customers by
  revenue, top 5 products by units fulfilled, and an expense breakdown by
  category over the last 30 days — all via Prisma aggregation
  (`groupBy`/`_sum`) or, where Prisma can't express a truncated-by-month
  grouping, the same "fetch the range, bucket in JS" approach the
  dashboard's `loadLowStock` already established in Phase 2. This is
  "business intelligence" in the plain sense — real numbers, correctly
  computed — and needed no AI at all. It's the new `/reports` page,
  gated by the `reports.sales`/`reports.financial` permissions that were
  seeded all the way back in Phase 1 and, until now, only powered one
  small card on the Expenses page.
- **The AI half only ever does real work or says so — never both-neither.**
  `generateBusinessSummaryAction` checks for `ANTHROPIC_API_KEY` in the
  environment first. If it's not set, it returns a plain "AI insights are
  not configured" result — not a fabricated paragraph pretending to be
  model output. If it *is* set, it sends the exact same real analytics
  data computed above to the Anthropic API (`@anthropic-ai/sdk`,
  `claude-sonnet-5`) and returns whatever the model actually says, or the
  real error if the call fails — never a fallback canned response papering
  over a broken integration. This is the only honest shape "AI insights"
  can take without either lying about a missing key or lying about a
  failed call.
- **Generated on demand, not on page load.** The Reports page renders a
  "Generate insights" button rather than calling the AI action
  automatically — a page view should never silently spend API budget the
  org didn't ask to spend in that moment.
- Verified in a real browser: created enough real activity (a fulfilled
  order, its invoice, a categorized expense) to produce non-trivial
  numbers, and confirmed the Reports page's revenue/top-customer/
  top-product/expense figures matched what those actions actually
  produced. Confirmed the AI section's honest behavior at both ends: with
  no `ANTHROPIC_API_KEY` set (this dev environment's actual, expected
  state), clicking "Generate insights" showed the plain not-configured
  message; with a syntactically-valid-but-wrong key set for one
  verification pass, it made a real network call to Anthropic's API and
  surfaced that API's own real authentication error — proving the
  integration genuinely calls the network rather than short-circuiting
  to a fake response, in both the configured and unconfigured states.

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

**Phase 8 — Expenses & Financial Reporting**
- Expense recording (branch-scoped, method/payee/reference/notes/category),
  reusing Phase 7's `PaymentMethod` enum and Phase 3's Category
  find-or-create pattern (extended with a new `EXPENSE` CategoryKind)
- Void (not delete) for correcting a mistaken entry, manager+ only
- A real "this month" revenue-vs-expenses summary on the Expenses page,
  gated behind `reports.financial` — the first feature to actually use
  that permission key since it was seeded in Phase 1

**Phase 9 — Employees, Tasks & Notifications**
- Real employee invitations (no fake email delivery — the invited person
  just logs in normally and their membership activates on first login),
  role assignment, branch scoping at invite time, suspend/reactivate
- A privilege-escalation guard so only an Owner can grant the Owner role
- Standalone tasks (not tied to a customer) with a `/tasks` page — My
  tasks / Team tasks, gated by new `tasks.*` permissions
- In-app notifications (a real header bell with unread count) fired when
  a task or customer is assigned to someone
- The project's first live two-membership cross-role browser test,
  closing verification gaps left open since Phases 4, 7, and 8

**Phase 10 — Industry Engine**
- A terminology engine — per-industry label overrides for a small set of
  nouns (Customer/Order today), wired into nav, page headers, and the
  dashboard, with most industries intentionally left at plain English
- A generic custom-fields framework (`CustomFieldDefinition`/
  `CustomFieldValue`), proven end-to-end on Customer: definition management
  on a new Settings page, dynamic rendering in the create form, and
  display + inline editing on Customer 360
- A Settings page (`/settings`, Owner-only via `organization.manage`) that
  also finally lets an org change its industry after onboarding
- Industry-specific business modules (Vehicle tracking, garment variants,
  etc.) are explicitly Phase 11/12's job, not this phase's — see that
  section above for why

**Phase 11 — Automobile Workshop**
- A real `Vehicle` model (make/model/year/plate/VIN, linked to a Customer)
  with its own detail page and full service history via `Order.vehicleId`
- Job Cards are just Orders with two extra nullable fields
  (`vehicleId`, `odometerReading`) — no parallel workflow, same
  create → fulfill → invoice → pay lifecycle every other order uses
- Industry-gated visibility: the Vehicles nav link, the Customer 360
  Vehicles tab, and the vehicle/odometer fields on the New Order form only
  render for `automobile_workshop`/`repair` orgs — a new axis alongside
  RBAC ("does this business have this concept" vs. "is this person
  allowed")
- `vehicles.*` permissions follow the same Manager-gets-all,
  Employee-gets-view/create/edit split used throughout the catalog

**Phase 12 — Clothing / Retail**
- A bulk Size × Color variant generator for Product — generic-core (every
  industry benefits), just motivated by clothing retail's real need;
  skips combinations that already exist instead of erroring on re-run
- Returns/exchanges: `OrderItem.quantityReturned`, restocking through the
  same movement ledger as every other stock change, finally exercising
  the `RETURN` movement type that's existed since Phase 4
- Deliberately does not reverse payment/invoice state — a real refund
  flow is left as a documented gap, not guessed at
- `sales.return` added, Manager and Employee both get it (frontline, same
  as the original sale)

**Phase 13 — AI Business Intelligence**
- A real `/reports` page: revenue trend, top customers, top products,
  expense breakdown — all real Prisma aggregation, no AI involved, finally
  giving the `reports.sales`/`reports.financial` permissions (seeded since
  Phase 1) a real home
- An honestly-gated AI narrative layer: reports "not configured" when no
  `ANTHROPIC_API_KEY` is set rather than fabricating output, and makes a
  real Anthropic API call (surfacing the real result or the real error)
  when one is — generated on demand via a button, never on page load

## Known gaps / deliberately not built yet

- No organization switcher — a user with multiple orgs always lands on the
  first membership found (`getDefaultMembershipOrRedirect`)
- No custom-role UI (the `roles.manage` permission exists, unused) — the
  invite flow (Phase 9) only ever assigns one of the three fixed system
  roles; branch assignment can be set at invite time but not edited after
- No configurable workflow engine — a deliberate Phase 9 scoping decision,
  see "Employees, Tasks & Notifications" above
- Customer still has an optional `branchId` that nothing enforces —
  `assertBranchAccess()` is now real (see "Inventory" above) but not yet
  applied to Customer reads/writes
- No customer edit/archive UI yet (create + assign only); no search/filter
  on the customer list beyond the default sort
- Notes and customer-scoped Tasks still ride on `customers.edit` rather
  than their own permission keys (standalone tasks got real `tasks.*`
  keys in Phase 9; customer-linked ones weren't revisited)
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
- No expense edit UI (create/void only, matching Invoice); no recurring
  expenses; no receipt/file upload
- Financial reporting is a single revenue-vs-expenses card for the current
  calendar month — no date-range picker, no per-branch or per-category
  breakdown, no export. Real but intentionally minimal; a fuller report
  is Phase 13's job (AI Business Intelligence), not this one's
- No way to edit an employee's branch assignment after the invite, or to
  remove a membership entirely (suspend is the only lifecycle action
  besides role change)
- Notifications have no per-type user preferences and no "notify me on X"
  triggers beyond task/customer assignment — real but minimal, same
  reasoning as the financial summary card
- Custom fields only exist for Customer (`CustomFieldEntityType` has one
  value); no bulk import/export of custom field values; definitions can be
  archived but not renamed or reordered
- No industry-pack auto-seeding of default custom fields — an Owner has to
  define fields by hand today; that seeding mechanism is deferred until
  Phase 11/12 actually exist to seed something (see "Industry Engine")
- No vehicle edit UI yet (create/archive only, matching the prevailing
  create-first pattern); no reminder system for upcoming service (e.g.
  mileage/time-based service due alerts) — real but out of scope until a
  concrete need for it shows up
- `vehicles.*` cross-role enforcement is verified at the permission
  catalog and UI-gate level only, same standing caveat as other
  manager-only/employee-scoped gates
- No refund/credit-note flow — a return restocks inventory and records
  what came back, but reversing the money already collected is a real
  feature intentionally left for later (see "Clothing / Retail" above)
- No variant editing after generation (bulk-generated variants can't have
  their price overridden or attributes changed in the UI yet — create-only,
  matching the prevailing pattern); no variant archiving either
- `sales.return` cross-role enforcement is verified at the permission
  catalog and UI-gate level only, same standing caveat as above
- No `ANTHROPIC_API_KEY` is configured for this deployment's environment,
  so the AI Summary feature is real but dormant until an operator sets
  one — this is expected, not a bug (see "AI Business Intelligence" above)
- The Reports page has no date-range picker (fixed 6-month/30-day windows)
  and no export; real but intentionally minimal, same reasoning as the
  Expenses page's financial summary card
- No saved/scheduled reports, no per-branch report breakdown
- Additional industry packs beyond Automobile Workshop and Clothing/Retail
  — the roadmap's Phase 14 — not started; ask before building another
  vertical, since which one is worth building next is a product decision,
  not an engineering one
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
