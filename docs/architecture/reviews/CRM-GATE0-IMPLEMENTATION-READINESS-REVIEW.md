# CRM / BOS Gate 0 implementation-readiness review

**Review date:** 2026-10-11

**Status:** Read-only review artifact; Gate 0 is not approved and implementation is not authorized.

## 1. Repository and working-tree findings

- The checkout is `C:\Users\moham\Documents\Codex\2026-10-09\imp\work\business-crm`, with `origin` set to `https://github.com/uzer-34/business-crm.git`. The current branch is `codex/property-management-dashboard`, two commits ahead of its configured origin branch.
- Before this documentation update, `git status` showed a modified dashboard file, untracked `.prisma-cache/`, and untracked `docs/architecture/` and `docs/implementation/` trees. The dashboard, cache, and unrelated/untracked implementation content are preserved. Only the decision register and this readiness review are edited; nothing is staged, committed, pushed, reset, or run against a live database.
- The actual schema is PostgreSQL/Prisma. It has `Customer` with `LEAD`, nullable `Task.customerId`, and nullable `Activity.customerId`; it has no `Opportunity` or Pipeline models. Current Task and Activity customer FKs reference `Customer.id` alone, not `(organizationId, id)`. Thus the application currently supplies tenant consistency, but these FKs do not enforce that a task/activity's organization matches its linked Customer.
- `Task` supports both customer-linked and standalone work. Customer-linked create/complete actions use `customers.edit` (with self-assignee completion exception); standalone creation uses `tasks.create`, and team task viewing/editing uses `tasks.view`/`tasks.edit`. `Activity` uses polymorphic `subjectType`/`subjectId`; the current helper writes Customer activities with a real `customerId` FK. `AuditLog` is a separate security/compliance record.
- `loadTenantContext()` re-derives an active membership and its role/permissions, while `assertBranchAccess()` checks a membership's branch links. The repository has cross-organization context/list/audit integration tests, but no Opportunity FK, RLS, or CRM permission tests. The existing tests were inspected, not run.
- The source contains one Prisma connection string (`DATABASE_URL`) through `PrismaPg`; the checked-in schema/migrations contain no RLS policies or transaction-local tenant-context setup. `field_values.entityId` is polymorphic text without a target FK. The Gate 0 proposal documents the larger table inventory and required composite-key work. Repository files cannot prove the deployed server version, hosting, pool mode, role grants, secrets, or catalog state.
- Product has confirmed that both self-service organization creation and employee invitations remain in launch scope. Repository code has an authenticated organization-creation flow that transactionally creates the Organization, default Branch, seeded roles/permissions, ACTIVE Owner Membership, and `organization.created` AuditLog. The employee invite flow creates an INVITED membership and an audit entry. This is implementation evidence only, not approval of the secure bootstrap design. A notable gap is that OTP login currently activates all INVITED memberships for that User; there is no separate expiring, single-use invitation acceptance with acceptance-time revalidation of inviter authority, role, organization, recipient, and branch scope. The context resolver requires an ACTIVE membership and returns no tenant context otherwise. These flows require security review before implementation is authorized.
- `docs/ARCHITECTURE.md` includes phase-era statements that need care: its earlier RBAC description predates standalone `tasks.*`, and it says Customer branch scope is not yet enforced consistently. Current code confirms the Customer branch gap, while inventory/purchase-order code already calls `assertBranchAccess()`.
- The supplied BOS V2 architecture reference agrees on bounded CRM/Pipeline ownership, typed pipeline-subject links, tenant-local transaction context/RLS, application authorization, and append-only audit. It also proposes broader Party, event/outbox, and quotations; those are not part of the accepted first slice and do not override the user's exclusions.

## 2. Proposed nullable Task / Activity Opportunity relation

### Recommended contract

Keep the existing `customerId` columns and behavior. Keep both `customerId` and the proposed `opportunityId` nullable for existing customer-only and standalone/general rows. For an Opportunity-linked Task or Activity, require `customerId` to be populated with that Opportunity's Customer. This keeps Customer 360 queries working and prevents an Opportunity-linked follow-up from pointing at a different Customer. A Task without an Opportunity remains valid with either a Customer link or no Customer link.

Use tenant-aware composite references, rather than an ID-only relation:

1. Add/retain a unique referenced key `Customer(organizationId, id)`.
2. The CRM `Opportunity` must have `UNIQUE (organizationId, id)` and `UNIQUE (organizationId, id, customerId)`, and a tenant-aware FK `(organizationId, customerId) -> Customer(organizationId, id)`. Customer is not unique on Opportunity, so multiple Opportunities per Customer remain valid.
3. Keep Task's `organizationId` non-null. Its Customer FK is `(organizationId, customerId) -> Customer(organizationId, id) ON DELETE CASCADE`, preserving current Customer-delete behavior for customer-only tasks. Add nullable `opportunityId` and an FK `(organizationId, opportunityId, customerId) -> Opportunity(organizationId, id, customerId) ON DELETE RESTRICT`. Add `CHECK (opportunityId IS NULL OR customerId IS NOT NULL)`.
4. Apply the same tenant-aware Customer FK and composite Opportunity FK to Activity. When `opportunityId` is non-null, require `customerId` and require `subjectType = 'Opportunity' AND subjectId = opportunityId`. The new writer should set `opportunityId`, `customerId = Opportunity.customerId`, and the matching polymorphic subject together. This leaves other Activity subject types unchanged.
5. Add indexes for `(organizationId, opportunityId)` on Task and Activity. Prisma should expose nullable typed Opportunity relations, while PostgreSQL migration SQL carries the composite keys/FKs and checks.

In PostgreSQL, the composite FK plus the check ensures a non-null Opportunity link belongs to the same organization and same Customer; an absent Opportunity skips that FK under normal `MATCH SIMPLE` semantics. The separate Customer FK still validates a populated `customerId`. Branch access, owner access, and active-owner rules remain application authorization obligations; the FKs do not grant access.

### Compatibility validation and remaining technical questions

The repository pins both `prisma` and `@prisma/client` to **7.10.0**. The current checked-in schema passes `prisma validate`. I also ran Prisma 7.10.0 `validate` against a temporary isolated PostgreSQL schema modeling Customer `(organizationId,id)`, Opportunity `(organizationId,id,customerId)`, and optional Task/Activity composite relations that reuse the organization/customer scalar fields. That isolated relation graph validated successfully. The temporary schema was removed afterward; no repository schema, generated client, or migration changed.

This confirms Prisma can represent the proposed optional composite relation shape and the referenced compound unique keys. It does not validate PostgreSQL `CHECK` constraints, generated migration SQL against production data, actual database deletion behavior, or runtime authorization. Before implementation, the DBA/data reviewer must settle: (a) the exact SQL checks and names; (b) whether to retain the current Customer `ON DELETE CASCADE` for Task/Activity while an Opportunity FK uses `RESTRICT`; (c) how to preflight and remediate existing organization/customer mismatches; and (d) whether the deployed PostgreSQL/catalog and migration window support the expand/validate sequence. No schema migration was generated or applied.

### Deletion, migration, and verification

- Do not cascade-delete Task, Activity, enrollment, or transition history when an Opportunity is deleted. Use `RESTRICT`/`NO ACTION`; archive Opportunities through the product lifecycle. Keep existing Customer cascades for Task/Activity when no Opportunity constraint blocks deletion. The Opportunity-to-Customer relation should also restrict hard Customer deletion while an Opportunity exists; the normal Customer archive path remains unchanged.
- Before replacing the current ID-only Customer FKs, run a read-only preflight for existing Task/Activity rows where `organizationId` differs from their linked Customer. Stop for reviewed remediation if any are found; do not silently rewrite ownership. Then add nullable Opportunity columns (no historical backfill is expected), composite unique keys, indexes, tenant-aware FKs, and checks in an expand/validate sequence appropriate to the verified database and migration window. Existing rows retain null `opportunityId` and current Customer links.
- Required tests after separate authorization: valid same-tenant Customer/Opportunity pairs; null Opportunity with nullable/present Customer; rejection of cross-tenant and wrong-Customer links; rejection of Opportunity without Customer; Activity subject/link mismatch; multiple Opportunities per Customer; deletion restrictions and preserved legacy cascade behavior; migration validation on existing data. RLS tests are a separate Gate 1 requirement.

**Approval point:** this is the recommended final FK contract for review, not authorization to change the Prisma schema or create a migration.

## 3. Permission matrix

No Opportunity/Pipeline capabilities currently exist. No new grant below is approved or present in the permission catalog. **Proposed** means recommended for Product review; **Unresolved** means no grant decision; Platform Admin is never granted through tenant RBAC.

| Capability | Allowed action and restrictions | Owner | Manager | Employee | Custom tenant role | Platform Admin |
| --- | --- | --- | --- | --- | --- | --- |
| `opportunities.view` | View Opportunities owned by the actor, within the tenant and permitted branch scope. | Proposed | Unresolved | Unresolved | Unresolved; grant explicitly per role | No tenant grant |
| `opportunities.view_all` | Override owner-only filtering only within the same tenant and otherwise permitted branch scope. Null branch remains tenant-wide only when capability and owner rules allow. | Proposed | Unresolved | Unresolved | Unresolved; grant explicitly per role | No tenant grant |
| `opportunities.create` | Create for a same-tenant Customer; assign active actor as initial owner by default. A null-branch/org-wide create needs a separately approved org-wide capability or scope. | Proposed | Unresolved | Unresolved | Unresolved; grant explicitly per role | No tenant grant |
| `opportunities.edit` | Edit allowed non-stage fields only on records within tenant, branch and owner/manage scope. Stage changes use the separate transition capability. | Proposed | Unresolved | Unresolved | Unresolved; grant explicitly per role | No tenant grant |
| `opportunities.assign` | Assign only to an active same-organization Membership. Enforce current record scope and target branch scope; cross-branch assignment requires explicit authority. | Proposed | Unresolved | Unresolved | Unresolved; grant explicitly per role | No tenant grant |
| `pipelines.configure` | Configure organization-owned drafts; grants no Opportunity visibility or transition right. | Proposed | Unresolved | Unresolved | Unresolved; grant explicitly per role | No tenant grant |
| `pipelines.publish` | Validate and publish an immutable version; grants no Opportunity visibility or transition right. | Proposed | Unresolved | Unresolved | Unresolved; grant explicitly per role | No tenant grant |
| `opportunities.transition` | Perform configured open-to-open transitions only; tenant/branch/owner scope, optimistic concurrency and atomic history/Activity/AuditLog still apply. | Proposed | Unresolved | Unresolved | Unresolved; grant explicitly per role | No tenant grant |
| `opportunities.followups.create` + `tasks.create` | Create a typed linked Task only when the actor can access that Opportunity; preserve same organization, Opportunity and Customer. Normal Task rules still apply. Standalone and existing Customer-only Tasks keep their current behavior. | Follow-up grant proposed; `tasks.create` exists in template | Follow-up grant unresolved; `tasks.create` exists in template | Follow-up grant unresolved; `tasks.create` exists in template | Both grants must be explicit; unresolved | No tenant grant |
| Separate `platform.*` grants | Operate only the approved platform control-plane metadata and licensing actions; every access/action is audited. No tenant business-data access or impersonation. | Not inherited | Not inherited | Not inherited | Not available through tenant roles | Separate principal/grants; unresolved pending security/product approval |

Role evidence: the `Owner` template derives grants from the current `PERMISSION_CATALOG`; adding future keys there would affect new Owner templates, while existing organizations would need a reviewed additive backfill. `Manager` currently has `customers.view/create/edit/assign` and `tasks.view/create/edit`; `Employee` has `customers.view/create/edit`, `tasks.view/create`, and `allBranches=false` by template. Neither template has Opportunity/Pipeline keys today. Custom roles are organization-specific subsets. These are repository template facts; deployed grants were not inspected. Proposed Owner grants are recommendations, not accepted grants.

### Opportunity-linked Task permission options

1. **Only `tasks.create`:** simplest, but any user allowed to create an ordinary Task may also be able to create a CRM-linked follow-up unless opportunity-specific checks are separately hidden in application logic.
2. **Only `opportunities.followups.create`:** clean CRM intent, but duplicates general Task authorization and can create a Task while denying ordinary Task creation.
3. **Require both `opportunities.followups.create` and `tasks.create` (recommended):** composes CRM association authority with the existing Task creation permission; still require Opportunity visibility and tenant/branch/owner checks. This is least-surprise for the existing Task system, but creates a new permission and may require Owner template/backfill work.

Recommendation 3 is **proposed, not approved**. Product must explicitly approve or choose another option, plus settle the exact org-wide/null-branch create and edit/assignment overrides. `customers.edit` is not an implicit substitute for either new Opportunity permission.

## 4. Platform Admin and licensing feature audit

The required Platform Admin is a separate control plane. Its requirements do not authorize broad tenant access. The proposed scope is a deliberately narrow, server-enforced ability to inspect and manage approved organization/license/subscription/payment/usage metadata with a durable audit record. Platform Admin is not a tenant Owner, membership, or a route around tenant authorization. No support impersonation or unlogged backdoor is permitted. Access to tenant business records is outside the proposed scope and would require a separate decision.

| Requested capability | Repository status | Evidence and limitation |
| --- | --- | --- |
| Separate Platform Admin identity, role and authorization boundary | Missing | No platform principal, grant catalog, guard, route or control-plane module found in the checked repository. Tenant Owner roles are organization-scoped. |
| Global organization directory and licensing/subscription/payment/usage view | Missing | `Organization` stores business metadata and document sequences. Existing `Payment`, `Invoice` and order models are tenant business records, not platform subscription/licensing data. |
| Activate, suspend, revoke and restore a platform license; server-side tenant access gate | Missing | Membership `SUSPENDED` status concerns an individual employee. `loadTenantContext()` requires an active membership, but there is no organization license state or license-aware server gate. |
| Lifetime, subscription and installment/EMI purchase and payment tracking | Missing | No platform purchase, entitlement, renewal, installment schedule or platform payment model was found. Existing invoice/payment states do not establish those features. |
| Platform-wide administrative audit and cross-tenant access trail | Missing as a capability | Generic `AuditLog` exists and is used for tenant events, but no Platform Admin action or platform audit boundary exists. `AuditLog.organizationId` may be null for pre-organization facts and its Organization relation cascades on deletion; it is not yet an approved platform audit store. |
| Preserve organization data and financial history during suspension/revocation | Unable to verify | No platform suspension/revocation operation exists. A future access gate must preserve organization, CRM/business, billing and audit data; retention, export and restoration rules need Product/Legal approval. |
| No impersonation/backdoor access | Missing as an explicit control | No Platform Admin access model exists to enforce or audit this prohibition. |
| Retained onboarding flows (related release prerequisite) | Partially implemented | Self-service creation and invitation actions exist, but invitation login activates every INVITED membership and lacks per-invitation expiry, replay protection and acceptance-time authority revalidation; see section 5. |

### Licensing policy proposal and unresolved product terms

Use provisional purchase labels `LIFETIME`, `SUBSCRIPTION`, and `INSTALLMENT` (including EMI where that is the approved product term). A candidate lifecycle is `PENDING_PAYMENT → ACTIVE → OVERDUE → SUSPENDED → REVOKED`, with restoration as an explicit, authorized and audited transition. These labels and transitions are proposals, not an approved schema. Lifetime entitlement never expires by a subscription clock. Overdue alone does not automatically suspend or revoke service. A license check must occur server-side on tenant requests; suspension or revocation gates access while retaining the Organization and its business, payment, and audit history. No provider, tax, interest, late fee, legal term, amount, duration, grace period or payment verification method is inferred here.

Product/Finance and Security must approve: access while payment is pending or overdue; any grace period; who may record or verify payments; subscription duration, renewal, cancellation, failed payment, refund and chargeback handling; installment schedule and delinquency behavior; which modules/features are licensed and any usage limits; exact suspension and revocation effects; whether revocation can be reversed and who can restore; data retention, export and deletion rules; Platform Admin eligibility, separation of duties and permitted cross-tenant fields; and the platform audit retention/review process. Until those terms and the control-plane security design are accepted, Platform Admin/licensing implementation and first sellable-release approval remain blocked.

## 5. Onboarding contract and current-flow gaps

The launch direction is settled: keep both explicit self-service Organization creation and employee invitations. Users without an active, authorized Membership receive no tenant access. Do not create an implicit Organization, unrestricted bootstrap identity or self-promotion path.

| Flow | Existing code evidence | Required secure contract / remaining review |
| --- | --- | --- |
| Self-service Organization creation | Authenticated action delegates to `createOrganizationForUser`; its Prisma transaction creates Organization, default Branch, seeded Roles/Permissions, active initial Owner Membership and `organization.created` AuditLog. | Security review must confirm the trusted actor/session, atomic failure behavior, abuse/rate controls, initial Owner invariants, retry/idempotency behavior, and audit integrity. No implicit creation on ordinary login or tenant lookup. |
| Employee invitation | Requires active tenant context and `employees.manage`; selected role and branch IDs are organization-checked; grants are limited to inviter permission subset; an INVITED Membership and audit entry are created. User is looked up by target email/phone. | Invitation must be recipient- and organization-bound, expiring, single-use and replay-proof. On acceptance, revalidate inviter authority, organization state, target recipient, role/permission subset, branches and existing membership. Acceptance must not allow self-promotion. |
| Invitation acceptance | OTP login currently activates all INVITED memberships for the authenticated User via a bulk update. No distinct invitation token/expiry or per-invitation acceptance revalidation was found. | Replace this activation contract only after separate implementation authorization; design an auditable acceptance flow that consumes one valid invitation and rechecks its authority and scope. |
| Tenant request context | `loadTenantContext()` resolves an ACTIVE Membership and its role/permissions; without one, the context is denied. | Keep the active-membership check on every tenant request and test no membership, invited, suspended, removed, wrong-org and expired-session paths. This is application code evidence, not RLS or deployment compliance. |

The current paths partially implement onboarding, but the invite activation behavior does not meet the proposed invitation acceptance contract. Review the bootstrap resolver/routines, grants, transaction boundaries, audit, expiry, replay and negative cases before Gate 0 acceptance. The retained self-service decision is no longer an open product-scope question.

## 6. Gate 0 evidence checklist

| Evidence | Repository-verifiable now | Read-only deployment/database evidence still needed | Responsible role | Blocks |
| --- | --- | --- | --- | --- |
| PostgreSQL/runtime topology | Prisma provider is PostgreSQL; runtime uses `PrismaPg` and `DATABASE_URL`. | Server/version, host, proxy and pool mode, transaction behavior, runtime/auth/migrator role separation, role attributes/grants, secret rotation capability. Use provider configuration and DBA-reviewed catalog/role queries; never reveal secret values. | Platform / DBA | Gate 0 and any tenant isolation implementation |
| Trusted session resolver | App resolver queries Membership through the shared Prisma client. Checked-in migrations/code contain no SQL `SECURITY DEFINER` resolver or transaction-local tenant context. | Review actual routine owner/privileges, definition, fixed safe `search_path`, schema-qualified references, no dynamic SQL, `PUBLIC` execute revocation, exact execute-only grant, and invalid/expired/revoked-session behavior in a production-like clone. | Security / DBA | Gate 0 |
| Tenant keys and constraints | Prisma/migrations expose direct-ID FKs and children without tenant keys; `field_values.entityId` has no target FK; CRM tables are not present. | Sanitized `pg_catalog` comparison; data anti-join preflight for inconsistent current links; composite-key plan for all dependent tables; chosen enforcement for polymorphic field values. | Data architecture / DBA / module owners | Gate 0 |
| Branch/owner scope | Branch checks exist in inventory and purchase-order paths; Customer branch checks are a known gap. Opportunity owner semantics are proposed. | Module-by-module read/query/mutation inventory and tests for organization-wide null branch, branch membership, owner filtering and active-member lifecycle. | Security / module owners | Gate 0 |
| Retained onboarding flows | Explicit org creation and employee invitation code are present; context resolution requires ACTIVE Membership. Current invite OTP activation gap is documented above. | Review and test trusted bootstrap, invitation token binding/expiry/single use/replay, acceptance-time authority revalidation, audit, and denial without an active membership. This is code/design review plus production-like tests; do not infer from a local checkout that deployment matches it. | Product / Identity / Security | Gate 0 onboarding acceptance |
| Recovery and migration operations | Local migrations exist; no production backup/restore or write-pause evidence is in checkout. | Name recovery owner; approve migration window/write pause; demonstrate tested backup/PITR restore; set rollback vs forward-fix authority and retain evidence. | Platform / Recovery owner | Gate 0 |
| Production catalog preflight | Local schema and migration ledger can seed the checklist; no production catalog was read. | DBA-produced sanitized report for tables/views/functions, owners/grants, RLS flags/policies and migration ledger; compare with inventory and sign auditable migration/recovery checklist. | DBA / Security | Gate 0 |
| Gate 0 approval | Accepted architecture and product directions are documented; no compliance claim is made. | Review/sign off deployment evidence, resolver, tenant constraints, module scope, onboarding, recovery and production preflight. | Product / Security / Platform approvers | Before tenant implementation |

No live database, production catalog, credential, hosted runtime or backup was accessed. PostgreSQL version, hosting, pool mode, database roles, grants, secret rotation, resolver privileges, production constraints, RLS, backup/PITR and catalog state remain **unverified**.

## 7. Shortest safe delivery roadmap

No dates are estimated. The responsible entries are roles, not named assignees.

| # | Milestone | Depends on | Deliverable and acceptance | Responsible role | Parallel work |
| --- | --- | --- | --- | --- | --- |
| 1 | Decision/document closure | Current user direction | Updated decision register and readiness review; preserve accepted CRM boundaries; explicitly record no implementation authorization. | Product/Architecture | Start here; documentation review can run while evidence owners are assigned. |
| 2 | Platform Admin/licensing gap audit | 1 | Repository audit, separate control-plane boundary proposal, lifecycle options and unresolved policy list; no invented provider/tax/legal terms. | Product/Finance, Security, Platform | Can proceed alongside 3 and 4. |
| 3 | Task/Activity FK design review | Accepted CRM model decisions | Final nullable typed FK, composite tenant constraints, deletion/backfill plan and test acceptance approved; no schema changes. | CRM/Data architecture, DBA | Can proceed alongside 2 and 4. |
| 4 | Onboarding/invitation security design | Launch decision to retain both flows | Review organization + initial Owner bootstrap and secure invitation acceptance; close bulk OTP activation gap in a design; approve negative tests and audit contract. | Identity/Security, Product | Can proceed alongside 2 and 3. |
| 5 | Gate 0 evidence collection and approval | 3, 4 and G1–G6 evidence | Verified deployment facts, role/resolver review, full tenant key and module scope review, production catalog preflight, recovery/PITR sign-off; formal Gate 0 acceptance. | Platform/DBA, Security, recovery owner, Product | Evidence gathering can start in parallel with 2–4; approval waits for blockers. |
| 6 | Separate implementation authorization | 5; platform policy and CRM permission/FK decisions approved for the work being authorized | Explicit user authorization that names the implementation scope. No inferred approval from architecture acceptance. | User/Product owner | Must precede all production code, schema, migration, RLS or CRM UI work. |
| 7 | Platform authorization and licensing foundation | 6 plus approved A10–A11 policy/design | Separate Platform Admin principal/grants, narrow metadata access, server-side entitlement gate, preservation behavior and platform audit; acceptance tests and audit review. | Platform/Security, Product/Finance | May run in parallel with 8 only with separate owners and an agreed integration boundary. |
| 8 | Approved CRM/Pipeline vertical slice | 6 plus approved FK/permission designs and Gate 0 controls | Customer/LEAD → Opportunity → published pipeline open-to-open transitions → existing Task/Activity; atomic transition/history/Activity/AuditLog, concurrency and idempotency. No quote/order conversion. | CRM/Pipeline, Data, Identity/RBAC | May run in parallel with 7 after shared architecture contracts are frozen. |
| 9 | Regression and tenant-isolation verification | 7 and 8 | Cross-tenant/branch/owner, role, bootstrap/invitation, licensing, migration, retry/concurrency and existing CRM/business regression evidence passes in an approved production-like environment. | QA, Security, module owners | Focused review can prepare during 7–8; final acceptance waits for both. |
| 10 | Prioritize remaining modules for first sellable release | 9 | Product-approved release scope and acceptance criteria for remaining modules, based on customer need and operational readiness; deferred items remain explicitly excluded until approved. | Product, module owners | Can do discovery while 9 runs; release scope acceptance follows evidence. |
| 11 | Production deployment and operational readiness | 9, 10 and separate deployment approval | Reviewed rollout/recovery checklist, backup/PITR verification, monitoring, support ownership, license operations, release sign-off and production evidence. | Platform/Operations, Security, Product | Operational preparation can run during 7–10; deploy only after approval. |

### Immediate blockers and next decisions

- **For tenant Gate 0:** name Platform/DBA, Security, module-scope and recovery owners; collect G1–G6 evidence; complete tenant key/`field_values.entityId` enforcement, module branch/owner review, onboarding acceptance design, catalog preflight and recovery plan. The onboarding product choice is settled; its security design is not.
- **For CRM implementation:** approve final Task/Activity FK contract and the capability matrix, including exact Owner/Manager/Employee/custom-role grants and the follow-up Task capability. Do not use existing Customer permissions as an implicit substitute.
- **For Platform Admin/licensing release:** approve the distinct control-plane actor/grants and cross-tenant metadata boundary; decide the unresolved lifecycle, payment and data-access/retention policies listed in section 4. These block Platform Admin/licensing implementation and first sellable release; they do not substitute for or prove tenant Gate 0.
- **For any implementation:** after required evidence and design approvals, the next action is a separate explicit user authorization naming the scope. Until then, application behavior, schema, migrations, RLS and CRM UI remain unchanged.

### Deferred features

Generic quotations and quote-to-order/order conversion; Won/Lost, reopening, pipeline reassignment; Teams; new Lead or Party identity; generic workflow engine; event delivery/outbox; and unrelated modules remain excluded from the first CRM slice. The existing repository no-quotation rule remains unchanged.

## 8. Review inputs and changed files

Read for this review/update: root `AGENTS.md`; `docs/ARCHITECTURE.md`; the CRM/Gate 0 decision proposals and generic quotation ADR; the BOS V2 reference in the supplied ZIP (CRM/Pipeline, tenancy, authorization, constraints, audit, tests and gates); `prisma/schema.prisma`; PostgreSQL migration lock and Customer 360 migration; `src/lib/db.ts`; `src/lib/rbac/guard.ts` and `permissions.ts`; organization creation, employee invitation and auth actions; Customer and standalone Task actions; Activity writer/timeline; `tests/tenant-isolation.test.ts`; `package.json`; and installed Next.js authentication and Server Actions guides. Repository searches covered Platform Admin, licensing, subscriptions, lifetime/EMI, organization suspension/revocation, and tenant access gates.

Files changed in this documentation-only update:

- `docs/architecture/decisions/CRM-GATE0-DECISION-REGISTER.md`
- `docs/architecture/reviews/CRM-GATE0-IMPLEMENTATION-READINESS-REVIEW.md`

Application code, Prisma schema/migrations, RLS policies, CRM UI, dashboard diff, `.prisma-cache/`, existing untracked implementation documents and Git index were not changed. No tests, migrations, live data access, staging, commit, push, merge, reset or deployment were performed.
