# CRM customer identity, opportunity, and pipeline decision proposal

**Status:** ARCHITECTURE DIRECTION ACCEPTED — final Task/Activity constraint design pending; implementation not authorized  
**Prepared:** 2026-10-11  
**Scope:** Architecture only. This proposal creates no application code, schema, migration, or behavior change.

The current accepted decisions and outstanding evidence are summarized in the [CRM and Gate 0 decision register](CRM-GATE0-DECISION-REGISTER.md).

The supplied BOS V2 kit is treated as reference material for review. The user's direct product directions in this request control this proposal; BOS V2's candidate first slice is not treated as implementation authorization.

## Approved direction

1. Reuse the existing `Customer` record and its `LEAD` status. Do not create a second `Lead` or `Party` identity model for the slice.
2. CRM owns `Opportunity` records and their business lifecycle.
3. Pipeline owns reusable pipeline definitions, immutable/versioned stage configurations, allowed transitions, pipeline assignment state, and stage-transition history.
4. Use a typed relationship from Pipeline to CRM opportunities. Do not use an unconstrained `subjectType`/`subjectId` pair as the only relationship or integrity check.
5. Deliver the initial vertical slice through existing Customer, Task, and Activity systems, without quotation workflow.

The user accepted these architecture directions and scope semantics on 2026-10-11. This approval is architecture direction only. The final Task/Activity foreign-key and tenant-constraint design must be presented for review before implementation. No production implementation, schema, or migration is authorized.

## 1. Customer as the initial lead identity

### Current repository facts

- `Customer` is tenant-scoped by `organizationId`, optionally linked to a `Branch`, and has `CustomerStatus` values `LEAD`, `ACTIVE`, and `INACTIVE`.
- Customer already supports assignment, contact and company fields, notes, tasks, activities, orders, invoices, and vehicles.
- There is no `Lead`, `Party`, or `Opportunity` model today.
- The repository architecture calls Customer a generic core identity and says industry-specific data belongs in modules that reference Customer.

### Proposed choice

Use the existing Customer row as the prospect/customer identity for the first CRM slice. An Opportunity references one Customer by a real foreign key, with tenant equality enforced as part of the relationship contract. `LEAD` remains a Customer lifecycle status; it is not a second entity. Do not create a duplicate Lead table or rename Customer to Party as part of this slice.

This keeps current Customer 360 history, ownership, and downstream sales references intact. It also avoids a conversion that copies or strands existing notes, tasks, activities, orders, and invoices.

### BOS Party implications and future migration

This is a bounded first-slice choice, not a claim that `Customer` is the final BOS-wide Party architecture. A future Party model may represent a person or organization once, with typed roles/capacities such as customer, supplier, employee, or partner. Customer currently combines identity/contact data with a customer-specific lifecycle and references; it is not yet that role/capacity model.

A future migration can be performed safely if it uses an expand/backfill/validate/contract sequence:

1. Approve Party identity, tenant ownership, role/capacity, and duplicate-resolution rules before schema changes.
2. Add Party and a stable Customer-to-Party mapping additively. Keep existing Customer IDs and foreign keys valid during migration.
3. Backfill one Party for each Customer within the same organization by deterministic ID mapping; do not merge records across tenants or infer identity from matching names/emails.
4. Validate that every Customer maps to exactly one Party, every mapping is tenant-consistent, and all existing references still resolve. Record exceptions for human resolution rather than silently merging them.
5. Move readers and writers in controlled releases, with reconciliation checks. Only after parity and rollback windows pass may a later approved migration retire duplicated identity fields or change ownership.

The migration is not automatically safe if a Party is expected to consolidate multiple existing records, if IDs are rewritten, or if historical customer-only semantics are lost. Those cases require explicit matching policy and a reference-by-reference plan. The initial choice preserves stable Customer identifiers, which makes the additive path feasible.

### Alternatives considered

| Option | Benefits | Costs and risks | Assessment |
| --- | --- | --- | --- |
| Reuse Customer + `LEAD` | Smallest slice; existing relationships and Customer 360 survive | Leaves a future identity/role migration | Recommended for the first slice |
| Add a separate Lead that later converts to Customer | Familiar lead funnel terminology | Duplicate contact identity, conversion/merge rules, split history and assignment | Reject for this slice |
| Introduce BOS Party now | Aligns early to a universal identity model | Broad cross-module migration and unresolved ownership/role semantics block a small CRM slice | Defer until Party architecture is approved |

## 2. CRM and Pipeline ownership

### Proposed module responsibilities

**CRM owns Opportunity business data and lifecycle**, including the Customer relationship, title/description, owner, value/currency, expected close date, source, priority, and business outcome. The exact initial field set is a product decision. CRM owns create/edit/assign/close-won/close-lost commands and CRM permissions.

**Pipeline owns organization-level reusable workflow configuration and progression**, including immutable published versions, stages within each version, allowed transitions, required transition inputs, typed enrollment/current-stage state, and append-only transition history. Pipeline owns pipeline-configuration and transition-policy permissions.

Pipeline configuration versions should be immutable once used by an Opportunity. A published change creates a new version; active Opportunities remain pinned to their existing version until a separately authorized migration moves them. This avoids silently changing historical meaning or making existing transition history invalid.

### Ownership alternatives

| Option | Benefits | Risks | Assessment |
| --- | --- | --- | --- |
| CRM owns both Opportunity lifecycle and all pipeline definitions/history | Fewer boundaries and simpler first pass | Pipeline becomes CRM-specific and other modules may duplicate workflow configuration | Viable only if reusable Pipeline is explicitly dropped |
| CRM owns Opportunity lifecycle; Pipeline owns reusable definitions, versions, stages, transitions, and history | Clear business ownership plus reusable progression rules | Requires typed bridge, cross-module integrity rules, and coordinated authorization | Recommended and matches the requested direction |
| Pipeline owns Opportunity lifecycle as well as definitions | Centralizes stage and record state | Pipeline would own CRM outcomes and customer-sales semantics without being their business context | Not recommended |

### Typed relationship strategy

Approved typed-relationship direction; the exact Prisma/SQL shape remains for a separately authorized implementation design:

- `Opportunity` remains a CRM-owned record and is the typed business subject.
- Pipeline stores an Opportunity-specific enrollment/binding row with a real `opportunityId` foreign key, plus `organizationId`, pipeline version, current stage, optimistic version, and lifecycle timestamps as needed.
- Each Opportunity has exactly one active enrollment in one published pipeline version and an active same-organization owner. The enrollment has a tenant-consistent real foreign key to the CRM Opportunity. Pipeline reassignment is excluded from this slice; future reassignment/history behavior is not decided here.
- Transition history references the typed enrollment and versioned stage IDs. The opportunity ID is available through that FK rather than being an unchecked string.
- If another module later needs Pipelines, it adds a typed bridge for that subject (for example, a separate typed enrollment relation), or a reviewed adapter/registry with enforceable foreign keys. It must not rely only on generic `subjectType` and `subjectId` strings.

Alternative: put `pipelineVersionId` and `stageId` directly on Opportunity. This is simpler initially, but gives CRM direct ownership of Pipeline state and couples the two bounded contexts. It is not the recommended boundary when Pipeline is intended to be reusable.

Prisma relation shape and PostgreSQL constraints must be checked together before migration design. Every new cross-module relation carries and validates `organizationId`; simple IDs alone are not sufficient proof of same-tenant ownership.

### Authorization implications

Every read and mutation must first resolve an authenticated user and active membership in the organization; an organization ID supplied by the client is not authorization. Fine-grained record checks must then include the selected scope contract.

Proposed separate capabilities include CRM opportunity view/create/edit/assign/close and Pipeline configure/publish/transition. Permission names are examples only; do not add them until approved. A permitted stage transition must satisfy all of:

- the caller has the relevant action capability;
- the Opportunity and enrollment belong to the caller's active organization;
- branch/team/owner rules authorize this particular record;
- the selected pipeline version allows the from→to transition;
- required transition fields and lifecycle rules are satisfied.

Pipeline administrators should not automatically gain access to every Opportunity. Conversely, an authorized Opportunity owner should not be able to bypass transition rules merely because they can edit the Opportunity. Hiding a button is not enforcement. The tenant-security proposal separately addresses trusted context and RLS.

## 3. Smallest useful vertical slice

**Approved first slice:** an authorized user selects an existing Customer/Lead (or creates one through the existing Customer flow), creates an Opportunity for that Customer, enrolls it in one published organization-level pipeline version, moves it only through configured allowed open stages, and creates/completes a follow-up using the existing Task system. Activity records the business action and AuditLog records the security action. Task and Activity use nullable typed Opportunity relationships where needed; preserve existing Customer relationships and behavior. Present the final FK and tenant-constraint design for review before implementation.

No quotation, quote-to-order conversion, order conversion, new Lead identity, event delivery, or outbox infrastructure is part of this slice. The first slice supports configured open-to-open transitions only.

## 4. Record scope and lifecycle semantics

These semantics are accepted architecture direction for the first slice. Permission-key names below describe capabilities, not new code already present in the repository.

### Pipeline ownership and enrollment

- Pipeline definitions are organization-owned and available across that organization's branches. The initial slice has no branch-specific pipeline definitions or stage graphs.
- An Opportunity must be enrolled in exactly one published pipeline version when created. Enrollment and Opportunity creation are one command and one transaction; neither a draft version nor a pipeline from another organization can be selected.
- A published pipeline version is immutable and has exactly one configured entry stage. The initial slice's entry and destination stages are open stages.
- Each Opportunity has one active enrollment in one published version, beginning at that version's configured open entry stage. Pipeline reassignment is excluded; its future behavior is not decided in this slice.
- Pipeline configuration permissions do not grant access to every Opportunity. Opportunity access is checked independently.

### Null branch scope

- For both Customer and Opportunity, `branchId = null` means an organization-wide/shared record. It does not mean “unknown branch,” “no access,” or “owner-only.”
- A same-organization member with the relevant module capability may access a null-branch record, subject to owner scope. A branch-limited membership may access a branch-specific record only when that branch is in its `MembershipBranch` scope; `allBranches` permits any branch in that organization.
- Creating an organization-wide/null-branch Opportunity requires an explicit organization-wide create capability. A branch-limited member without that capability must choose a branch they can access.
- Opportunity and linked Customer branch checks are independent: a user must be authorized for both records. If both records have non-null branches, the branches may differ only when the acting user is authorized for both; the relation itself never widens access. Null Customer branch remains organization-wide under the same rule.
- These rules are a target contract. The repository currently does not enforce Customer branch access consistently.

### Owner and team scope

- An Opportunity must have an owner represented by an active Membership in the same organization. Creation defaults owner to the creating membership. No unowned Opportunity is allowed in the first slice.
- Without an explicit organization-wide `opportunities.view_all` capability, a member can read only Opportunities they own, and only if they also pass organization and branch checks. `view_all` removes only the owner filter; it does not bypass tenant or branch scope.
- Update and stage-transition commands require their own action capability and either ownership or an explicit organization-wide manage capability. Pipeline configuration access never substitutes for these checks.
- Assignment/reassignment requires a separate assign capability. The new owner must be an active member of the same organization and, for a branch-specific Opportunity, must have access to that branch. A permitted cross-branch reassignment requires an explicit organization-wide assignment capability.
- Teams are out of scope: the repository has no Team membership model to authorize against. No implicit Manager/team-wide access is inferred from a role label; access comes from explicitly granted capabilities.
- Every Opportunity must remain owned by an active same-organization Membership. Suspending or removing a membership that owns Opportunities is blocked until those Opportunities are atomically reassigned to another active same-organization owner; no Opportunity may remain assigned to an inactive owner.

### Multiple Opportunities per Customer

- One Customer may have any number of Opportunities, including multiple simultaneously open Opportunities. There is no unique constraint on Customer or Customer/title.
- Each Opportunity has its own lifecycle and one current Pipeline enrollment. Moving or closing one Opportunity does not convert, archive, or change the Customer's `LEAD` status.
- Duplicate detection may later warn, but it must not merge or block records without a separately approved rule.

### Explicitly deferred lifecycle behavior

Won/Lost, reopening, and terminal-stage transitions are excluded. No terminal close fields, reasons, reopen permissions, or future closure mechanics are approved by this slice. A future proposal must define those before any close/reopen implementation. A closed state does not create an Order or Quote in this scope.

### Acceptance criteria for a future implementation

1. An active member with the approved capability can create an Opportunity linked to a same-organization Customer; a cross-organization Customer cannot be linked.
2. Customer remains the single identity. Creating or moving an Opportunity does not duplicate or implicitly convert the Customer.
3. Pipeline assignment pins an Opportunity to a published configuration version. A transition to an unconfigured, cross-version, or disallowed stage is rejected server-side.
4. Successful stage changes record the actor, time, pipeline version, from/to stage, and request identity in transition history; the Activity timeline receives a user-facing entry.
5. A follow-up task can be created, assigned, due-dated, and completed through the existing Task lifecycle and is associated with the correct CRM context using an approved typed relationship.
6. Every list/detail/mutation enforces tenant and approved branch/owner scope. Missing trusted tenant context fails closed.
7. Duplicate requests do not create duplicate transitions, activities, or audit effects. Concurrent stale stage changes return a conflict and do not overwrite the winner.
8. Denied actions return no cross-tenant record data and create no partial state.

### Test plan to implement only after approval

- Unit/domain: valid and invalid stage graph edges; version pinning; required transition values; Customer status behavior; task linkage validation.
- Database integration: same-tenant constraints, cross-tenant foreign-key attempts, rollback of partial transition writes, unique/idempotency constraints, concurrent compare-and-swap updates, and rejection of owner suspension/removal while Opportunities remain assigned unless reassignment is atomic.
- Authorization integration: active/suspended membership, organization boundary, branch membership, owner/team scope, missing context, capability denial, and pipeline-admin versus Opportunity-owner separation.
- End-to-end: Customer/Lead → Opportunity → allowed stage change → follow-up task → Activity visibility; rejected transition and retry behavior; responsive and keyboard-accessible stage controls.

This is a documented test plan only; no tests were added or run in this decision-preparation task.

## Remaining scope questions

- Which role templates receive `view_all`, `manage_all`, organization-wide-create, and assignment capabilities? Define explicit permission grants, not role-name shortcuts.
- What exact nullable Task/Activity Opportunity foreign keys, composite tenant constraints, deletion behavior, and Customer-link behavior should be used? Present the final schema design for review before implementation.
- What future Party identity/role rules will be adopted? This does not block the first slice if Customer IDs are preserved.

## Recommendation and exact approval needed

The accepted direction is to reuse Customer + `LEAD`, keep stable Customer IDs, assign Opportunity lifecycle to CRM, assign organization-level published pipeline versions/enrollment/transitions/history to Pipeline, and use typed tenant-safe relationships. Null-branch, owner/team, and multiple-Opportunity semantics above are accepted. Won/Lost, reopening, pipeline reassignment, quotations/order conversion, event delivery, and outbox infrastructure are excluded. Gate 0 must be approved and the remaining design questions answered before implementation authorization.

**Approval status:** architecture decisions and scope semantics are accepted. The final Task/Activity FK design, Gate 0 evidence, and a separate explicit implementation authorization remain required. This approval does not authorize production code, schema changes, migrations, policies, or UI work.
