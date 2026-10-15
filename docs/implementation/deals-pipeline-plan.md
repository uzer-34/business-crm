# CRM Deals / Opportunity Pipeline — architecture decision plan

**Status:** CRM direction approved; Gate 0 contract finalized for review; production code, policies, and migrations remain unauthorized.  
**Prepared:** 2026-10-11  
**Repository:** `uzer-34/business-crm`  
**Feature branch:** `codex/property-management-dashboard`

## 1. Verified repository state

- The checkout is a Next.js 16.3.5 / React 19 application using Prisma 7.10, PostgreSQL, server actions, and Vitest.
- Local `HEAD` is `95b090a` (`Add customer account statement`). The local `origin/codex/property-management-dashboard` tracking ref is `4f261e0`; Git reports the local branch two commits ahead.
- The working tree has a modified `src/app/(app)/dashboard/page.tsx`, plus untracked `.prisma-cache/` and `docs/implementation/`. No files were staged or discarded.
- The dashboard diff adds the “Open balances” cards. GitHub’s connected repository tool confirmed the feature branch exists and returned that dashboard file (blob `d540d92bc134963eee3d8c81faecdf0c16f98b85`). Its content matches the working copy after normalizing the final CRLF/LF difference. The local tracking ref is therefore stale relative to the fetched file. A direct `git ls-remote` request failed in this environment, so the branch’s live commit SHA was not independently retrieved.
- Recent local commits are `2d19ce9` (payment ledger and cashbook) and `95b090a` (customer account statement). The current diff and pre-existing untracked paths were left intact.
- Migrations currently run through `20261010190000_phase15_supplier_payment_ledger`.
- `AGENTS.md` requires reading the installed Next.js guides before writing application code. It contains no product-domain or CRM-specific rule.
- The repository has `docs/ARCHITECTURE.md`; no BOS V2 document is tracked in the repo. The supplied `BOS_Codex_Implementation_Kit.zip` does contain `docs/architecture/BOS-MASTER-ARCHITECTURE-V2.txt`, along with the implementation-gate, security, database, and first-vertical-slice documents.
- Relevant existing test files include `tests/tenant-isolation.test.ts`, `tests/validation.test.ts`, `tests/navigation.test.ts`, and `tests/list-view.test.ts`. No tests were run during this read-only inspection.

## 2. Existing reusable entities and components

- `Customer` is the current CRM record and already has `status: LEAD | ACTIVE | INACTIVE`, assignment, contact fields, organization scope, and an optional branch. There is no separate Lead, Contact, Deal, Opportunity, Pipeline, Quote, or Quotation model.
- `Task` already supports customer linkage, assignment, due date, completion state, and standalone tasks. It has no typed opportunity relation.
- `Activity` is a generic subject timeline (`subjectType` / `subjectId`) with actor and timestamp. It is distinct from the append-only security `AuditLog`.
- `Order` and `OrderItem` implement immediate, persisted sales; the order owns Decimal totals and product/service price snapshots. `Invoice` is generated from an order. No quotation lifecycle exists.
- `loadTenantContext`, `requirePermission`, and `assertBranchAccess` are the existing authorization primitives. `src/lib/rbac/permissions.ts` is the permission catalog and role template; `src/lib/navigation/modules.ts` and `create-actions.ts` drive navigation and quick-create actions.
- Existing pages and UI primitives under `src/app/(app)`, `src/components/ui`, and the current Buzne-inspired theme are the presentation baseline. The user-selected Buzne UI remains the exact visual target; other supplied screenshots are supplemental references.

## 3. Existing functionality to preserve

- Preserve the dashboard, including the open-balance summary, and the current Buzne-inspired shell and responsive navigation.
- Preserve existing customer, task, activity, order, invoice, payment, inventory, and cashbook lifecycles.
- Do not stage or overwrite `.prisma-cache/`, the existing `docs/implementation/initial-readiness-report.md`, or any other pre-existing local changes.
- Do not make a quote directly create an invoice, payment, or inventory movement. Any quote-to-order operation must call the Sales-owned order workflow.

## 4. Approved architecture direction (implementation not authorized)

1. **CRM context:** reuse `Customer` with its `LEAD` status; preserve stable Customer IDs. CRM owns typed Opportunity records and their business lifecycle. Do not add a duplicate Lead or Party model in this slice.
2. **Pipeline context:** Pipeline owns organization-owned reusable definitions, immutable/versioned stages, allowed transitions, each Opportunity's typed enrollment, and transition history. Enforce same-organization integrity for every typed relationship.
3. **Tasks and Activity:** integrate follow-up with existing Task and Activity using typed Opportunity relations where needed; keep Activity (business timeline) separate from AuditLog (security audit).
4. **Transition commands:** write stage state and transition history atomically; use optimistic concurrency with explicit stale-state conflicts and idempotency keys. Keep events/outbox/event delivery outside this slice.
5. **Explicit exclusions:** no quotation workflow, order conversion, new Lead identity, or event-delivery infrastructure. The repository's no-quotation rule remains unchanged.
6. **UI direction:** implement only after separate authorization, using the approved Buzne target and the documented pipeline/customer semantics; use real data, accessible stage changes, bounded pagination, and responsive layouts.

These are approved architecture choices, not permission to implement them. Any later implementation design must first resolve the Gate 0 questions and CRM-specific blockers linked below. Candidate source areas are not a work authorization.

## 5. Database and migration impact

The proposed feature needs durable typed records, tenant-safe relations, foreign keys, unique keys, query indexes, and explicit history/versioning. If generic quotations are later approved, their monetary snapshots, numbering, and conversion must follow the separate quotation ADR proposal; none is part of the current first-slice proposal.

The current repository uses application-level organization filters and selective branch checks; it has no PostgreSQL RLS policies. BOS V2 requires forced, fail-closed RLS and transaction-local tenant context. The repository also has no machine-enforced module ownership, formal event outbox/inbox, or general idempotency contract. These are architecture-level prerequisites, not details to guess inside this feature migration.

## 6. API and authorization impact

The current pattern is authenticated server actions that re-derive active membership and permissions with `loadTenantContext`, then scope records by `organizationId`. Branch isolation is enforced selectively; `Customer.branchId` is optional, and the repository architecture identifies customer branch enforcement as a gap.

Before implementation, settle the Gate 0 deployment/authentication blockers, capability-to-role mapping, the required fields/reasons for any future Won/Lost commands, and exact typed Task/Activity foreign-key behavior. The CRM package documents the proposed branch/owner scope contract; confirm it before implementation. The audit/idempotency package records the approved atomic-write direction. Quotation capability is excluded.

## 7. UI screens and responsive behavior

- **Overview:** persisted counts/value, overdue follow-ups, upcoming closes, and wins/losses for a selected period. Do not show a win rate until its denominator and time window are approved. Show real loading/empty/error/permission states.
- **Pipeline:** columns from configured stages; filters/search and a keyboard-accessible stage-change control. Drag-and-drop is optional and should be omitted if it cannot use the same server-validated transition command.
- **Table:** bounded pagination, search, sorting, owner/stage/date/status filters, and permission-aware row actions.
- **Detail:** customer/contact, value, stage, owner, notes, activity, follow-up tasks, and authorized audit/history. Quote versions and linked-order conversion are excluded from the proposed first slice.
- **Forms:** server-validated required fields, inline errors, submission state, duplicate-submit protection, and only fields the current user may change.
- **Responsive:** retain the Buzne white/soft-gray canvas and warm red action accents from the supplied references; use compact stage chips, readable cards, and mobile-priority record layouts. No fabricated charts or sample business metrics.

Figma frame inspection for a dedicated Deals screen has not been completed; the current plan uses the supplied screenshots and existing repo UI. Do not claim the Figma file was inspected for this feature.

## 8. Tests and acceptance criteria

After Gate 0 is approved and implementation is separately authorized, add tests for:

- opportunity validation, customer/lead links, owner scope, tenant boundaries, branch/record scope, list filters, and bounded pagination;
- allowed and rejected transitions, required fields, terminal won/lost data, stage-history actor/time, retry safety, and concurrent updates;
- follow-up creation/completion through the existing Task system and activity visibility through the existing timeline;
- UI loading/empty/error/validation/permission states, mobile layout, keyboard stage changes, and dashboard regression.

The package scripts are `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. None were run in this inspection. Do not report passing results until each is run and inspected.

## 9. Decision packages and blocking decisions

The supplied BOS V2 is treated as review material, not implementation authorization. Its security/database contracts and first vertical slice are marked `NEEDS_REVIEW`; the repository is not claimed to be BOS V2-compliant. The user has approved the CRM direction and explicitly excluded quotation and event-delivery infrastructure. Gate 0 remains unimplemented and requires the remaining security/deployment confirmations recorded in its package.

The repository's `docs/ARCHITECTURE.md` defers generic Sales quotes, while the supplied BOS V2 candidate first slice includes Quotation → Order and remains `NEEDS_REVIEW`. The user explicitly reaffirmed the no-quote rule; the quotation ADR records option A as decided, and the rule remains unchanged.

The architecture decision packages are:

1. [CRM customer identity, Opportunity, Pipeline, and first-slice proposal](../architecture/decisions/CRM-OPPORTUNITY-PIPELINE-PROPOSAL.md)
2. [Tenant security Gate 0/1 proposal](../architecture/decisions/TENANCY-GATES-0-1-PROPOSAL.md)
3. [Stage-transition audit, concurrency, idempotency, and event contract proposal](../architecture/decisions/CRM-AUDIT-IDEMPOTENCY-PROPOSAL.md)
4. [Generic Sales quotation ADR proposal](../architecture/adr/ADR-PROPOSAL-GENERIC-SALES-QUOTATIONS.md)

The Customer/LEAD reuse, CRM/Pipeline ownership split, typed Opportunity relationship, first-slice exclusions, transition atomicity/concurrency/idempotency direction, and unchanged no-quote rule are approved as architecture direction. The exact CRM scope semantics and Gate 0 contract are documented in the linked packages; remaining questions include role-to-capability assignment, terminal close-required fields, deployed DB/role configuration, onboarding/membership bootstrap, cross-module branch/owner rules, and recovery ownership.

Until the remaining blocking questions are resolved and the user gives separate explicit implementation authorization, schema, RLS policy, migration, server-action, permission, and UI implementation remain blocked. This preparation changed documentation only; no commit, push, merge, or deployment was performed.
