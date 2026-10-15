# Initial Readiness Report

Audit date: 2026-10-09  
Scope: Business CRM repository and the supplied BOS Codex Implementation Kit, with the requested dashboard UI as the proposed first visual slice.  
Status: Read-only audit. No application code, database schema, or migrations were changed. Tests were not run.

## 1. Repository inventory

- Repository: `uzer-34/business-crm`; branch: `codex/property-management-dashboard`, created from `main`.
- Stack from `README.md` and `package.json`: Next.js 16 App Router, TypeScript strict mode, Tailwind CSS v4, Prisma 7, Zod v4, PostgreSQL, React 19, Vitest.
- Main paths: `src/app/`, `src/components/`, `src/lib/`, `prisma/`, `tests/`, `docs/`.
- Prisma migrations are present through the metadata engine phase. Vitest coverage includes validation, tenant isolation, navigation, list views, and metadata behavior.
- The current branch starts at commit `8af6122` (`Milestone 2: metadata, attribute and category engine`); the checkout was clean after cloning.

## 2. Current implementation gate

- The application already contains CRM and adjacent business modules: customers, tasks, products/services, inventory, suppliers/purchasing, orders, invoices/payments, expenses, employees, reports, and vehicle records. `docs/ARCHITECTURE.md` describes the implemented phases and known gaps.
- The requested visual work is best bounded as a presentation-only CRM dashboard/shell slice. It should retain existing permission checks and data sources and avoid schema or domain behavior changes.
- The supplied kit's `CODEX_MASTER_PROMPT.md` requires the first pass to be read-only, then requires an explicit gate approval. Its architecture's Section 68 also says production implementation must wait while blocker decisions remain unresolved. The current application architecture and supplied BOS architecture are not the same scope: the kit describes a broader BOS target and flags unresolved domain contracts.

## 3. Blockers and risks

| ID | Severity | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| B1 | BLOCKER for exact visual implementation | The requested Paperpillar Figma frame could not be inspected. Both `get_design_context` and the required screenshot fallback were rejected by the Figma Starter-plan MCP call limit. | Figma MCP responses on 2026-10-09; user-provided design link #2 | No verified frame screenshot, tokens, component details, or responsive states are available to use as the exact target. | Open |
| B2 | BLOCKER for broader BOS production work | Supplied architecture lists unresolved tenant context, authorization, Party ownership, inventory concurrency, finance corrections, payroll snapshots, event idempotency/replay, module ownership, launch industry/slice, and AI retrieval contracts. | Kit `docs/architecture/BOS-MASTER-ARCHITECTURE-V2.txt`, Section 68 | Do not expand the dashboard request into new domain workflows or data models. | Open |
| B3 | HIGH | The supplied kit's `.ai/registries/` templates are not present in the repository. | Kit file manifest; repository has no `.ai/` directory | Screen/component/token ownership and approvals are not machine-recorded in this repo. | Open |
| B4 | HIGH | The repo architecture documents customer branch scope as unenforced for customer reads/writes. | `docs/ARCHITECTURE.md`, “Known gaps / deliberately not built yet”; `src/lib/rbac/guard.ts` | Any future dashboard data changes must preserve organization filtering and must not imply branch isolation that is not enforced. | Open |
| B5 | MEDIUM | The requested design is a property-management dashboard, while the current documented industry packs are Automobile Workshop and Clothing/Retail. The user specified the UI as the reference, but did not select property management as a product industry. | User-provided Figma link #2; `docs/ARCHITECTURE.md`, “Phase roadmap” and “Known gaps” | Treat the design as a visual reference only unless the user separately selects a product vertical. | Open |

## 4. Tenant isolation

- Server-side code resolves an active membership and role permissions in `src/lib/rbac/guard.ts` through `loadTenantContext`; the code comment explicitly says organization identity must not be trusted from request data.
- Customer, product, report, and dashboard paths generally scope queries with `organizationId`; the dashboard obtains its organization through the active membership and loads permissions before permission-gated panels.
- No PostgreSQL `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, or equivalent statements were found in `prisma/` during this audit. Current isolation is application-query and permission based, not database RLS.
- `tests/tenant-isolation.test.ts` contains integration tests using two organizations with overlapping customer/product data and checks context rejection for a foreign organization. The test was inspected but not run.
- The architecture doc records that `Customer.branchId` exists but branch access is not enforced on customer reads/writes. `assertBranchAccess` exists in `src/lib/rbac/guard.ts` and is used by some branch-scoped modules.
- No background-job, event-consumer, or external-storage tenant isolation implementation was found in the searched `src/` and `prisma/` paths. The repo also states file storage is not configured for metadata file/image fields.

## 5. Authorization and ownership

- `Permission`, `Role`, `RolePermission`, and `Membership` are database models. Mutations use `requirePermission` in `src/lib/rbac/guard.ts`; navigation visibility is presentation-only.
- The app shell receives role/permission context from the server layout and builds navigation from it. Server-side authorization remains the authority.
- The supplied architecture requires a shared Party identity model and distinct User/Employee concepts. The current Prisma schema uses Customer and Supplier domain models and User/Membership identity records; no `Party` or `LegalEntity` model was found.
- The application architecture documents customer-linked tasks/notes sharing `customers.edit`; standalone tasks have separate permissions.

## 6. Data integrity and migrations

- PostgreSQL/Prisma schema and migrations exist. Inventory is documented as an append-only movement ledger with a transactionally maintained stock projection; transfers and negative-stock checks are implemented in the current codebase.
- The architecture lists inventory reservation/concurrency/reconciliation details as unresolved at the broader BOS level. Do not add inventory behavior as part of a dashboard redesign.
- Invoicing/payments and expenses exist; invoice paid amount is a cached sum/projection. The application architecture documents no invoice edit UI and no distinct credit-note document. Full accounting, payroll, and their correction/snapshot contracts are not implemented as part of this CRM.
- No database migration is needed for a strictly visual dashboard change.

## 7. API, commands, events, and idempotency

- The application primarily uses Next.js server actions and server-rendered route loaders. Actions perform server-side membership/permission checks.
- No general outbox/inbox, event replay, background worker, or job queue implementation was found in the searched source and Prisma paths. This matches the supplied kit's identified event/idempotency blocker.
- Do not introduce asynchronous side effects or new domain commands for this visual slice.

## 8. UI/UX and design system

- The app has shared UI components under `src/components/ui/`, a tokenized `src/app/globals.css`, an application shell in `src/components/shell/app-shell.tsx`, and a data-driven dashboard at `src/app/(app)/dashboard/page.tsx`.
- The shell has a desktop sidebar and mobile bottom navigation/drawer. The current dashboard shows real organization counts, attention items, activity, and setup progress; its queries are organization-scoped and some panels are permission-gated.
- The supplied Figma URL is the requested exact visual reference, but no Figma node/frame content or screenshot was returned because of the MCP plan limit. The additional Figma links were not used to substitute for the mandated second reference.
- The supplied kit's registry templates are not installed in the repository. No tokens, assets, component variants, or interaction states from the target Figma frame have been verified.

## 9. Responsive, mobile, and accessibility

- Responsive behavior exists in the shell and shared components through Tailwind breakpoints; mobile navigation is explicit in `src/components/shell/app-shell.tsx`.
- This audit found no dedicated accessibility test suite or verified WCAG audit. The supplied architecture targets WCAG 2.2 AA and requires focus, loading/error/empty/denied states. These need review against the Figma frame once accessible.
- No screenshot-based responsive verification was possible because Figma returned no screenshot.

## 10. Testing and operations

- Test files are present under `tests/`; `package.json` defines `lint`, `typecheck`, `test`, `build`, and a combined `check` script.
- Tests, build, lint, and typecheck were not run in this audit.
- This repository inspection did not establish production observability, backup/recovery, or deployment/rollback procedures. Those remain unverified rather than assumed absent.

## 11. Secrets and privacy

- `README.md` documents `DATABASE_URL` and optional provider credentials as environment variables; the app architecture says AI reports a missing provider key rather than fabricating output.
- No secret values were read or recorded. No production environment configuration was inspected.
- The dashboard proposal requires no new external integrations or secrets.

## 12. Missing registries/contracts

- The supplied kit includes JSON registries for tokens, components, screens, modules, ownership, permissions, dependencies, commands, events, and capabilities, but these are not present in the repo.
- The kit says these are templates requiring review, not already-approved policy. They should not be copied into the repo as if decisions were frozen.
- The target Figma-to-screen mapping is unknown until the exact frame can be inspected.

## 13. Recommended bounded scope and non-goals

- Proposed slice: reproduce the requested dashboard/shell presentation from the Paperpillar Figma frame while keeping the existing CRM data, server actions, tenant scoping, and permission behavior intact.
- Non-goals: changing the launch industry, adding property-management domain entities, changing authorization, modifying schema/migrations, adding integrations or AI actions, or replacing real data with static sample content.
- Acceptance criteria and visual comparison cannot be finalized until the exact frame screenshot/context is available.

## 14. Decisions / next step

1. Provide a screenshot/export of the exact Paperpillar frame or restore Figma MCP access after the Starter-plan limit resets. This is required to follow the user's “strictly use” direction.
2. Confirm the bounded implementation is a visual dashboard/shell slice only, leaving the CRM's current domain and industry unchanged.
3. Review and approve that bounded slice as the next implementation gate. The supplied `CODEX_MASTER_PROMPT.md` explicitly requires an audit-only first pass and a gate approval before production code changes.

No production code was changed in this audit.
