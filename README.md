# Business CRM

A web-first, international, multi-tenant Business Management CRM / Business
Operating System — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the
product principle (generic core + industry intelligence), the tenancy and
RBAC model, and what's actually implemented vs. planned.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind CSS v4 ·
Prisma 7 · Zod v4 · PostgreSQL.

## Local development

Requires Node 20.9+ and a local PostgreSQL instance.

```bash
# 1. Create a database and user, then set DATABASE_URL in .env
createdb business_crm

# 2. Install dependencies (also generates the Prisma client)
npm install

# 3. Apply migrations
npm run db:migrate

# 4. Seed the permission catalog (required before creating any organization)
npm run db:seed

# 5. Start the dev server
npm run dev
```

Sign-in is passwordless (email or phone OTP). In development, codes are
printed to the server console instead of being sent — look for
`[dev-otp] email to ...: 123456` in the terminal running `npm run dev`.

## Commands

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run check` — lint + typecheck + build
- `npm run db:migrate` — create/apply a migration in development
- `npm run db:deploy` — apply pending migrations (production/CI)
- `npm run db:seed` — seed the permission catalog
