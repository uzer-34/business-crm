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

## What exists today (Phase 1 — Foundation)

- Passwordless OTP auth (phone + email), sessions, audit log
- Organization creation wizard (country/currency/timezone/locale/industry)
- Branch model + a real Branches page (list + create, permission-gated)
- RBAC: Permission catalog, per-org Role seeding, `requirePermission` guard
- PWA manifest + installable icons (no offline support — brief explicitly
  says not to fake this)
- Dashboard shell with real (currently mostly-zero) counts, no fabricated
  metrics

## Known gaps / deliberately not built yet

- No organization switcher — a user with multiple orgs always lands on the
  first membership found (`getDefaultMembershipOrRedirect`)
- No employee invitation flow — an Owner exists (the org creator); there is
  no UI yet to invite a second Membership
- No custom-role UI (the `roles.manage` permission exists, unused)
- `assertBranchAccess()` is unused until a branch-scoped data model exists
- Customers, Products, Inventory, Sales, Invoices, Payments, Expenses,
  Industry Engine, AI — all later phases per the roadmap, not started
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
