# BOS tenant security Gate 0/1 decision package

**Status:** ARCHITECTURE PROPOSAL ACCEPTED — Gate 0 evidence pending; implementation not authorized  
**Prepared:** 2026-10-11  
**Scope:** Decision package only. No code, SQL, policies, migrations, or tests are changed or run here.

The accepted direction and evidence owners are summarized in the [CRM and Gate 0 decision register](CRM-GATE0-DECISION-REGISTER.md).

## Decision purpose

Prepare the prerequisite decision package for trusted tenant context, organization/branch/owner scope, authorization, PostgreSQL row-level security (RLS), Prisma transaction handling, migration safety, and cross-tenant verification before a CRM implementation begins.

The current repository is **not verified as BOS V2-compliant**. It has application-level organization checks and selective branch checks, but no PostgreSQL RLS policies or common tenant transaction-context helper. This package makes no compliance claim.

## Current baseline

- `loadTenantContext(userId, organizationId)` re-reads an active membership and its role permissions from the database. The `userId` comes from a verified server session; the requested organization ID still must match an active membership.
- `requirePermission` checks a flat capability set. `assertBranchAccess` checks `MembershipBranch` when the call site uses it.
- Branch enforcement is selective. `Customer.branchId` is nullable, and `docs/ARCHITECTURE.md` records that customer branch access is not enforced yet.
- `src/lib/db.ts` exports one Prisma Client using Prisma 7's `PrismaPg` adapter and a connection string. There is no shared tenant-aware transaction helper in the inspected code.
- The schema includes organization-owned tables and cross-entity tables; not every existing path is proven to apply a consistent org/branch/owner predicate.
- No RLS policy or `FORCE ROW LEVEL SECURITY` adoption has been found in the repository migrations reviewed for this package.

## Gate 0 — finalized trust and authorization contract

This section records the proposed contract for owner review. It does not implement the contract or authorize production changes.

### Trusted context and membership bootstrap

1. The server receives an opaque session cookie and never trusts request-supplied user, membership, role, branch, or owner IDs. Hash the cookie in server code; do not store or log its raw value.
2. Recommended request path: start one Prisma interactive transaction on the `app_runtime` pool. Its first database operation calls a fixed `SECURITY DEFINER` routine such as `auth.resolve_session_context(token_hash)`. The routine checks the stored session hash, expiry, and revocation, sets transaction-local `app.user_id` from the matched session row, and returns only minimal verified session facts. The current `User` model has no active/suspended field, so no user-status check is assumed. Missing/invalid session returns no context. `app_runtime` receives `EXECUTE` on this one routine, never direct reads of `sessions` or `otp_challenges`; the routine owner has only the minimum auth-table privileges it needs. The function has a fixed safe `search_path`, schema-qualified object references, revoked `PUBLIC` execute, and no dynamic SQL.
3. An organization selector from a cookie, route, or request is only an untrusted candidate. With only `app.user_id` established, query Membership through the same `tx` client under a self-only bootstrap policy, constrained in the query to that candidate organization. Require an `ACTIVE` row whose organization matches the candidate. If none exists, abort without tenant data.
4. Only after that membership row is verified, set transaction-local `app.organization_id` and `app.membership_id` from its database values. Then read the Organization, Role, RolePermission, Permission, and MembershipBranch data required for authorization, with organization RLS active. MembershipBranch must have a tenant key or an equally strong reviewed integrity/policy design before it is relied on under RLS.
5. Derive capabilities, branch scope, and owner scope from those database rows. The entire logical read/command uses the same Prisma `tx` client and connection. No nested helper may silently use the global client or open an independent transaction. Return no database context or raw `tx` client to browser code.
6. Missing/suspended membership, organization mismatch, invalid context, revoked session, or failed authorization aborts and returns no tenant data. Missing, empty, malformed, or stale settings deny by default; there is no unrestricted fallback.
7. The self-membership bootstrap policy keys off `app.user_id`; all tenant-row policies key off `app.organization_id` only after membership validation. Never use a client-supplied organization ID as proof, or query tenant rows before context is established.
8. Custom PostgreSQL settings are mutable by a session using the runtime credential. This contract therefore protects against omitted tenant predicates and accidental unscoped queries, but **does not** make RLS a defense against arbitrary SQL execution, compromised application code, or stolen runtime credentials. Parameterized queries, CSRF/session protection, secret isolation, least privilege, and application security remain required. Do not claim protection against a malicious holder of `app_runtime` credentials.

#### No-membership / first-organization bootstrap

The initial-release preference is administrator-provisioned memberships. Users without an active Membership receive no tenant access; do not create an implicit Organization or unrestricted bootstrap path. The current schema has no invitation model. The exact controlled, auditable administrative provisioning process remains to be documented and verified. Self-service organization creation or invitation acceptance is out of scope unless confirmed as a launch requirement; if confirmed, it needs a separate narrow control-plane design and approval. No onboarding flow is implemented by this package.

### Scope and authorization

Use and enforce these independent predicates:

- **Organization:** mandatory for every tenant-owned row; each read and write is constrained to the verified organization. Cross-tenant joins and foreign keys are rejected, not merely hidden. For an Opportunity, Customer, Task, or Activity with `branchId = null`, the approved CRM direction is organization-wide within that tenant; it does not bypass owner/capability rules.
- **Branch:** the approved CRM semantics are in `CRM-OPPORTUNITY-PIPELINE-PROPOSAL.md`: null means organization-wide; branch-specific data requires membership scope. RLS initially enforces organization boundary; server authorization enforces branch membership on both read and write. A later RLS branch predicate requires a separate reviewed decision.
- **Owner/team:** the approved CRM first-slice contract requires an active same-organization Opportunity owner; without view-all, users see only their own records after tenant and branch checks. No Team model or implicit role-name bypass is introduced. Explicit capabilities govern view-all/manage-all/assignment. The same semantic separation applies to other modules after their scope is inventoried.
- **Action:** authorize read/create/edit/assign/transition/close/configure separately. A capability does not itself grant tenant, branch, or owner scope.
- **Obligations:** enforce required status, owner, branch, pipeline transition, and reason fields in the server command and database constraints where expressible, not only in UI.

Application authorization remains the source of capabilities, branch/owner scope, and business obligations. RLS supplies a mandatory independent organization boundary. The first RLS release does not attempt branch/team policy logic; this is defense in depth, not a replacement for server authorization.

### RLS role and policy contract

Contract for review:

- Runtime application role is neither superuser nor `BYPASSRLS`, does not own protected tables, and has no `TRUNCATE` or schema-altering grant. `FORCE ROW LEVEL SECURITY` applies to the enumerated tenant-owned tables.
- Direct-tenant policies require a non-null transaction-local organization setting equal to the row tenant key, for reads and `WITH CHECK` on writes. A missing setting returns no rows / rejects writes. Membership bootstrap is a narrowly scoped self-membership policy keyed by `app.user_id` set by the session resolver in the same transaction; the GUC remains an application-supplied assertion and is not cryptographically immutable at the database role boundary.
- Global/auth/control-plane tables are explicitly classified below. No broad policy makes them tenant-readable. Global permission catalog is read-only to runtime; auth records are exposed through narrow auth operations; null-organization AuditLog rows are not visible to ordinary tenant queries.
- Organization RLS is the Gate 1 boundary; branch and owner checks remain mandatory in application authorization. Fine-grained RLS is deferred until a separate reviewed contract.
- Migrations run under a separate deployment credential that assumes a non-login schema-owner role only for controlled DDL. It is never configured in the application. An audited break-glass path is separate from normal runtime.

Alternatives considered: (a) application predicates only—simpler but rejected against the approved BOS tenant boundary; (b) organization RLS plus application branch/owner authorization—recommended for Gate 1; (c) encode organization, branch, owner, and team in RLS immediately—deferred because the current code has inconsistent branch checks and no Team model.

## Complete current database table inventory

This inventory covers all 40 current Prisma models mapped to PostgreSQL tables, every table created by the current migration history, and Prisma's migration ledger. No view or materialized view creation was found in the current migrations. It is a schema/repository inventory, not a production database catalog audit. Gate 1 must compare it with `pg_catalog` in each deployed database before changing policy state. No current RLS exception is implied by classification.

| Current table | Classification | Gate 1 policy / integrity treatment |
| --- | --- | --- |
| `users` | Shared global identity | No broad organization-wide exposure. Restrict self profile and same-org directory projection to approved fields and relationships. |
| `otp_challenges` | Global authentication control plane | No tenant policy. No ordinary tenant-data role gets table reads; expose only narrow auth operations. |
| `sessions` | Global authentication control plane | No tenant policy or direct runtime read. Session validation uses the fixed resolver described above. |
| `organizations` | Tenant root | Access selected organization only after membership bootstrap; policy compares `id` to verified `app.organization_id`. |
| `branches` | Tenant-owned (`organizationId`) | Organization RLS; branch membership is an additional application-level scope check. |
| `memberships` | Tenant-owned user/organization link; bootstrap input | Bootstrap policy exposes only rows for `app.user_id`, constrained to the candidate org in the query; after selection, tenant policy also requires `app.organization_id`. |
| `membership_branches` | Tenant join table, currently no `organizationId` | Add a tenant key and composite constraints, or approve an equally strong reviewed design, proving the Membership and Branch share an organization before relying on RLS. Read only after selecting membership and setting tenant context. |
| `permissions` | Global reference catalog | Runtime read-only; contains no tenant data. |
| `roles` | Tenant-owned (`organizationId`) | Organization RLS; read only after a verified membership sets organization context. |
| `role_permissions` | Tenant join to global Permission, currently no `organizationId` | Add/derive tenant key and composite FK or reviewed equivalent so Role cannot cross organizations. Permission remains global. |
| `customers` | Tenant-owned (`organizationId`), optional branch scope | Organization RLS; branch checks in server authorization; related Membership/Branch must be same tenant. |
| `notes` | Tenant-owned (`organizationId`) | Organization RLS; referenced Customer and author identity must be authorized and tenant-consistent. |
| `tasks` | Tenant-owned (`organizationId`) | Organization RLS; referenced Customer and assigned Membership must be tenant-consistent; preserve standalone tasks. |
| `activities` | Tenant-owned (`organizationId`) | Organization RLS; typed Customer link must be same tenant. `subjectType/subjectId` remains polymorphic and is not a typed FK by itself. |
| `categories` | Tenant-owned (`organizationId`) | Organization RLS; parent Category, if present, must share tenant. |
| `products` | Tenant-owned (`organizationId`) | Organization RLS; Category, Supplier, and actor relationships must share tenant. |
| `product_variants` | Tenant child of Product, currently no `organizationId` | Add tenant key and composite parent FK, or reviewed equivalent, before forced RLS. |
| `services` | Tenant-owned (`organizationId`) | Organization RLS; Category and actor relationships must share tenant. |
| `inventory_movements` | Tenant-owned (`organizationId`) and branch scoped | Organization RLS plus server-side branch checks; Product, Variant, Branch, and source document must share tenant. |
| `stock_levels` | Tenant-owned (`organizationId`) and branch scoped | Organization RLS plus branch checks; Product, Variant, and Branch must share tenant. |
| `suppliers` | Tenant-owned (`organizationId`) | Organization RLS; actor and purchase relationships must share tenant. |
| `purchase_orders` | Tenant-owned (`organizationId`) and branch scoped | Organization RLS plus branch checks; Supplier and Branch must share tenant. |
| `purchase_order_items` | Tenant child of PurchaseOrder, currently no `organizationId` | Add/derive tenant key and composite parent FK; Product and optional Variant targets must share tenant. |
| `orders` | Tenant-owned (`organizationId`) and branch scoped | Organization RLS plus branch checks; optional Customer, assigned Membership, Vehicle, and Branch must share tenant. |
| `order_items` | Tenant child of Order, currently no `organizationId` | Add/derive tenant key and composite parent FK; Product/Variant/Service targets must share tenant. |
| `vehicles` | Tenant-owned (`organizationId`) | Organization RLS; Customer and actor must share tenant. |
| `invoices` | Tenant-owned (`organizationId`) and branch scoped | Organization RLS plus branch checks; Order, Customer, and Branch must share tenant. |
| `invoice_items` | Tenant child of Invoice, currently no `organizationId` | Add/derive tenant key and composite parent FK before forced RLS. |
| `payments` | Tenant-owned (`organizationId`) financial ledger | Organization RLS; Invoice and recording actor must share tenant; preserve financial ledger semantics. |
| `order_payments` | Tenant-owned (`organizationId`) financial ledger | Organization RLS; Order and recording actor must share tenant; preserve financial ledger semantics. |
| `supplier_payments` | Tenant child of PurchaseOrder, currently no `organizationId` | Add/derive tenant key from PurchaseOrder and composite parent FK before forced RLS. |
| `expenses` | Tenant-owned (`organizationId`) and branch scoped | Organization RLS plus branch checks; Category, Branch, and recording actor must share tenant. |
| `notifications` | Tenant-owned (`organizationId`) and recipient Membership scoped | Organization RLS; recipient Membership must match tenant; recipient visibility remains membership-specific. |
| `field_sections` | Tenant-owned (`organizationId`) metadata | Organization RLS. |
| `field_definitions` | Tenant-owned (`organizationId`) metadata | Organization RLS; optional Section must share tenant. |
| `field_definition_categories` | Tenant join of FieldDefinition and Category, currently no `organizationId` | Add/derive tenant key and composite FKs; mismatched-tenant category assignment must fail. |
| `field_options` | Tenant child of FieldDefinition, currently no `organizationId` | Add/derive tenant key and composite parent FK before forced RLS. |
| `field_values` | Tenant child of FieldDefinition, currently no `organizationId`; `entityId` is polymorphic/no FK | Add/derive tenant key from FieldDefinition and enforce same-tenant target validation in application/entity registry. RLS on this row alone cannot prove polymorphic target ownership. |
| `category_field_recommendations` | Tenant-owned (`organizationId`) metadata | Organization RLS; referenced Category must share tenant. |
| `audit_logs` | Security audit table; `organizationId` nullable for pre-org events | Tenant rows use organization RLS. Null-org auth events are unavailable to ordinary tenant context and require a narrowly scoped auth/security reader. Never delete or expose them as a tenant-wide exception. |
| `_prisma_migrations` | Prisma deployment control plane (not a Prisma application model) | Deployment/migrator only; no runtime application grant. |

Current migration history also contains legacy `custom_field_definitions` and `custom_field_values`; the metadata migration copied their data and dropped those tables. They are not current application tables, but Gate 1 must verify they are absent in deployed catalogs or classify any environment drift before rollout. PostgreSQL enum types are schema objects, not RLS tables.

### CRM tables to add to the inventory before Gate 1 implementation

The first slice will introduce new tenant data only after separate implementation authorization. The design must inventory `opportunities`, organization-owned pipeline definitions/versions/stages/transition rules, typed Opportunity enrollment, transition history, and Task/Activity Opportunity links using the final approved physical names. Every tenant-owned CRM/Pipeline row must carry or derive an enforceable `organizationId`; every cross-module FK must include tenant equality. No future table is exempt merely because it is new.

## Gate 1 — implementation and verification contract

Gate 1 may start only after Gate 0 is approved and the implementation itself is explicitly authorized. Its expected work is:

### Prisma transaction handling

- Use Prisma 7 interactive `$transaction(async tx => ...)` for each logical tenant operation because membership resolution, context setup, and data queries require control flow. Every query inside that operation uses only `tx`, never the module-global `db` singleton. Keep the callback short; perform no network calls or user waits inside it.
- First database operation in the transaction calls the fixed session resolver with the server-hashed opaque cookie; the resolver validates it and sets `app.user_id` transaction-locally. The bootstrap RLS policy is self-only on Membership. Resolve and validate the candidate's ACTIVE Membership through `tx`; then set `app.organization_id` and `app.membership_id` from that verified database row. Only after this step load tenant-scoped Organization/Role/RolePermission/Permission/branch data. Continue the business operation on the same `tx` connection.
- Use PostgreSQL transaction-local settings only; never session-persistent `SET` state. Commit and rollback clear local settings before a pooled connection is reused. No tenant query may run before the required context is established, except the explicitly specified self-membership bootstrap query.
- Missing context must evaluate to deny. RLS policies should use null-safe fail-closed expressions; never default to a system organization or use an empty-string wildcard.
- Any nested domain operation accepts the transaction client/context as an argument and cannot silently open an independent connection. Read pages that need several tenant queries also use one context-bound transaction per logical request.
- The session resolver is a narrowly scoped `SECURITY DEFINER` routine. Grant `app_runtime` execute permission only on the context-resolving routine needed at the start of the tenant transaction; it has no direct `sessions`/`otp_challenges` read and no unrestricted auth-table scan. `app_auth` is a separate credential for login/OTP-only operations and may execute only its fixed auth routines; it has no tenant business-table access. The no-login routine owner holds only the minimum columns/rows needed to validate session state. The function returns minimal verified facts, has fixed safe `search_path`, schema-qualified references, no dynamic SQL, and no `PUBLIC` execute. Hash the opaque cookie server-side before passing it to SQL. This function/role design is proposed, not present in the repository.
- Background jobs must receive a service identity and an explicitly authorized organization/membership context before entering the same transaction wrapper. Seeds and migrations use their separate roles. No unscoped bypass path is implicit.
- Validate this behavior against the repository's pinned Prisma 7.10 and `PrismaPg` versions. Prisma's v7 transaction callback documents that queries through its `tx` client run inside the transaction; PostgreSQL documents `set_config(..., true)` as local to the current transaction. These references support the contract, not a claim of implementation: [Prisma v7 transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions) and [PostgreSQL configuration settings](https://www.postgresql.org/docs/current/config-setting.html).

This is a target contract, not an assertion that PrismaPg already provides any particular behavior in this application.

### Migration safety

1. **Preflight:** compare the inventory above with every deployed `pg_catalog`; verify backups and restore procedure; record current grants, owners, RLS flags, policies, raw SQL, server actions, route loaders, seeds, scripts, and scheduled jobs. Classify any drift before release.
2. **Role preparation:** provision separate runtime, auth, schema-owner/migrator, and break-glass identities; test grants in a production-like clone. Runtime cannot own tables, bypass RLS, truncate, or alter schema; it can execute only the minimum context-resolver routine. Auth can only execute fixed login/OTP operations and has no tenant data access. The migrator receives schema-owner privileges only through explicit `SET ROLE` during deployment; role membership is non-inheriting and unavailable to runtime. No credentials are changed by this document.
3. **Additive schema preparation:** add tenant keys to dependent tables that need direct policies; backfill only from trusted parent rows; add tenant-aware unique keys/composite FKs and supporting indexes; validate row counts and cross-tenant references. Use online/concurrent index techniques where appropriate and a controlled validation step for large constraints. Do not drop existing columns or IDs.
4. **Compatible application release:** after explicit implementation authorization, route all tenant operations through the context-bound transaction wrapper and migrate every path in the inventory, including reports, nested relations, raw SQL, exports, auth, seeds, and jobs. Keep behavior fail-closed for any unconverted path. Run the test matrix in a clone using the actual non-owner runtime role.
5. **Policy staging:** create/verify policies and grants in a production-like clone; inspect generated plans and exercise all app flows with missing and valid settings. Enabling RLS without a policy is default-deny, so policy definitions and RLS enablement must be applied atomically per migration cohort.
6. **Production enforcement:** only after the compatible release is live and verified, apply `ENABLE` and `FORCE ROW LEVEL SECURITY` with fail-closed policies to the complete enumerated tenant table set (and CRM tables after their separately approved schema exists). Use a reviewed rollout window, lock-time preflight, monitoring, and immediate smoke checks. Do not declare Gate 1 complete while any tenant-owned table remains outside the policy inventory.
7. **Post-rollout:** verify runtime and auth roles, policy catalog, tenant isolation, pooled connection reuse, all table families, background work, audit access, and rollback readiness; record evidence before marking any compliance statement.

Prefer additive expand/backfill/validate/contract steps. Do not combine CRM schema creation with broad RLS conversion in one unreviewed migration.

### Rollback and recovery contract

- **Before RLS enforcement:** roll back the application release normally. Additive tenant keys and indexes may be retained if compatible; remove them only when no data or foreign key depends on them.
- **After forced RLS is enabled:** do not roll back to application code that lacks transaction-local context, and do not disable RLS, drop policies, or grant `BYPASSRLS` as a routine fix. Prefer a forward application correction that preserves the context contract.
- If a release cannot safely serve tenant writes, pause those writes or route to a known-good context-aware build while policies stay enabled. Use the audited migrator only to correct schema/policy defects. Restore from a verified backup/PITR only for data corruption and follow the incident recovery plan.
- A policy rollback is an incident action requiring security-owner approval, tested scope, time limit, audit log, and a safe runtime role. It must not expose cross-tenant data; if a safe restrictive policy cannot be retained, disable tenant writes until fixed.
- RLS-policy creation and enable/force for a table cohort are atomic. An incomplete rollout is not represented as compliant. Expansion/down migrations after data has been written are not destructive and are not assumed reversible.

### Database-role separation

| Role | Allowed purpose | Explicit restrictions |
| --- | --- | --- |
| `app_runtime` | Tenant-scoped application reads/writes; execute the single context-resolver routine at the start of a tenant transaction | No superuser, `BYPASSRLS`, protected-table ownership, schema DDL, `TRUNCATE`, direct auth-table reads, or role switching; all tenant tables subject to forced RLS. Custom GUCs remain mutable, so this role is still a trusted application credential. |
| `app_auth` | Execute fixed login/OTP-only routines | No direct auth-table reads, tenant business-table access, customer data, or general membership scans. |
| `auth_function_owner` | Own read-only session/auth security-definer routines and hold only the minimum auth-table column privileges those routines require | `NOLOGIN`; no tenant-table grants, no general schema ownership, no broad DDL. Function `search_path` is fixed, references are schema-qualified, dynamic SQL is prohibited, and `PUBLIC` execute is revoked. |
| `onboarding_function_owner` (if selected) | Own the narrowly scoped initial-organization/invitation bootstrap routine | `NOLOGIN`; no general tenant read/write grants. Any write privilege is limited to required onboarding tables and only exercised by reviewed, fixed function logic. This role is a decision option, not an existing role. |
| `schema_owner` | Own schema objects and policies | `NOLOGIN`; not used by app processes. |
| `db_migrator` | Controlled deployment-time DDL through explicit `SET ROLE schema_owner` | `NOINHERIT` from `schema_owner`; credential available only to deployment operation, separated from app runtime, audited and rotated. No day-to-day request traffic. |
| `break_glass` | Time-limited incident recovery under documented approval and audit | Not a standing app credential. Any RLS-bypassing capability requires explicit emergency scope and post-incident review. |

PostgreSQL documents that superusers and `BYPASSRLS` roles bypass RLS and table owners normally do unless `FORCE ROW LEVEL SECURITY` applies; the runtime role therefore must be neither. See [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). RLS does not protect against arbitrary SQL execution under a role that can set arbitrary custom context; parameterized queries, credential isolation, and code security remain necessary.

### Required cross-tenant test matrix

Tests to implement after approval, not run in this documentation task. Run them against PostgreSQL using the actual non-owner `app_runtime` role and a production-like schema, not a superuser/table-owner test connection.

1. **Full table matrix:** for every tenant-owned table in the inventory, seed rows for Organizations A and B. Attempt SELECT by list, detail, guessed ID, count/aggregate, nested relation, raw SQL, UPDATE, DELETE, and INSERT with wrong organization. A must never read or mutate B, including through child rows.
2. **Bootstrap:** valid session resolver sets only the matched user ID; expired/revoked/unknown session resolves none. Resolver and membership lookup occur within one tenant transaction. A user can bootstrap only their own ACTIVE membership. Candidate organization without that membership or a suspended membership returns no tenant data. Missing/empty/malformed settings deny access. Revocation between requests takes effect on the next resolver call. The auth role cannot read customer or other tenant tables. Users without membership cannot enter tenant context; test the separately approved onboarding/invitation path or confirm tenant data stays inaccessible until an administrator provisions membership.
3. **Context/pool:** verify transaction-local settings are on the same PrismaPg connection as queries; on commit and rollback, reuse that pooled connection and prove the next request has no prior user/org/membership setting. Run interleaved concurrent A/B transactions and prove no context crossover.
4. **Cross-tenant integrity:** attempt mismatched Customer→Opportunity, Opportunity→Pipeline enrollment, Task/Activity→Opportunity, Membership→Branch, Role→RolePermission, Product→Variant/line, Order→line/Payment, Invoice→line/Payment, PurchaseOrder→item/SupplierPayment, and FieldDefinition→Category/Option/Value. Every typed relation must reject tenant mismatch. Exercise the documented polymorphic exceptions (`Activity.subjectId`, `FieldValue.entityId`) and their server-side validation explicitly.
5. **Branch/owner:** null branch behaves as organization-wide; branch-specific reads/writes are restricted to membership branches; owner-only versus view-all/manage-all actions; assignment to suspended, cross-tenant, or out-of-branch owner is denied; no Team permission is inferred from role name. Notifications remain recipient-only; audit history remains separately authorized.
6. **System tables:** membership-bootstrap and `users` directory projection do not expose another tenant's user profile; global Permission is read-only; null-org AuditLog auth rows are invisible to normal tenant context; `_prisma_migrations` is unavailable to runtime.
7. **Role enforcement:** runtime is neither superuser nor `BYPASSRLS`, does not own tenant tables, cannot `TRUNCATE` or alter policies, and observes forced RLS. Migrator can perform only approved DDL; break-glass access is audited. Confirm table-owner and forced-RLS behavior in PostgreSQL.
8. **Migration/recovery:** apply migrations on a restored clone, verify row counts/FKs/indexes, simulate failed partial policy rollout (atomic rollback), exercise the context-aware app version, and rehearse the documented forward-fix/backup recovery path.

## Remaining blocking questions

- Confirm hosting/deployment environments, PostgreSQL versions, connection pool/proxy mode, and whether runtime/auth/migrator credentials can be separated and rotated. The local checkout cannot establish deployed `pg_catalog`, grants, or secret configuration.
- Confirm owner/security acceptance of a `SECURITY DEFINER` session resolver with a non-login owner, fixed safe search path, and execute-only access to the one context-resolver routine for `app_runtime`; `app_auth` remains restricted to login/OTP routines. This package recommends that separation; it is not implemented.
- Approve the refined transaction bootstrap contract: the resolver runs as the first DB operation in the same transaction, validates the server-hashed cookie, and sets `app.user_id`; Membership RLS exposes only that user's membership row(s); the app validates an ACTIVE membership for the untrusted organization selector and only then sets `app.organization_id`/`app.membership_id` from that row. Decide whether the resolver may be called by `app_runtime` for this purpose; the recommendation is execute-only access to this one function with no auth-table grants.
- Confirm that self-service organization creation and invitation acceptance are not launch requirements. The accepted initial-release preference is administrator-provisioned memberships with no tenant access until a membership is active. Document and evidence the controlled provisioning path; if self-service is required, prepare and approve a separate narrow onboarding design before rollout.
- Approve adding/deriving organization keys and tenant-consistent composite constraints for the dependent tables listed in the inventory, including `supplier_payments`, joins, and metadata values. `field_values.entityId` remains polymorphic and needs a separate enforcement choice.
- Confirm whether any module outside CRM requires branch/owner rules different from organization-wide null scope. Current code has selective branch checks; complete module-callsite validation is a Gate 1 task.
- Name the recovery owner, production migration window, tested backup/PITR procedure, and maximum acceptable write pause. A real deployment catalog comparison is required before migration planning can be declared final.
- Produce a production-catalog preflight plan and an auditable migration/recovery checklist. The checklist must identify the evidence to capture, review owner, deployment gates, failure handling, and recovery sign-off; do not claim this evidence exists until it is produced and reviewed.

## Recommendation and exact approval needed

The accepted architecture proposal is documented with a complete current-schema inventory, same-transaction session/self-membership bootstrap, transaction-local Prisma context, organization RLS plus application-level branch/owner authorization, database-role separation, administrator-provisioned membership preference, migration/recovery sequence, and a table-wide cross-tenant test plan. Gate 0 remains **unapproved pending evidence** and is unimplemented and unverified. Gate 1 execution is blocked on the remaining evidence and approvals.

**Gate 0 approval condition:** complete and review the evidence and decisions above. This document does not request or grant implementation authorization. After Gate 0 approval, production work still requires the user's separate explicit implementation instruction. This is not a statement of current compliance and does not authorize RLS policies, schema changes, SQL migrations, or CRM code.
