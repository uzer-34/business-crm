# Platform bootstrap and licensing foundation

This is an implementation note, not production approval. The platform feature gate remains off unless `PLATFORM_CONTROL_PLANE_ENABLED=true` is explicitly supplied. No Neon or Vercel configuration is changed here.

## First-principal provisioning

There is no public signup, Server Action, or tenant-owner path for creating platform principals. An authorized database operator must first verify the target identity and create a time-bounded `PlatformBootstrapAuthorization` row out of band. The row binds one existing `User.id`, exactly one of two capabilities (`platform.organizations.view`, or `platform.security.manage` when a separate security-admin designation is approved), an operator/ticket reference, an expiry, and the SHA-256 hash of a high-entropy one-time token. The plaintext token is supplied only through `PLATFORM_BOOTSTRAP_TOKEN`; it is never stored or printed by the repository code.

For local development only, set `PLATFORM_PROVISIONING_TARGET=local`, use a `DATABASE_URL` whose host is loopback (`localhost`, `127.0.0.1`, or `::1`), keep `PLATFORM_CONTROL_PLANE_ENABLED` unset/false, and run `npm run platform:provision-principal -- <user-id>`. The command creates an active principal with exactly the bound capability and consumes the authorization in the same transaction as its audit record. It refuses production, remote database hosts, active tenant Owners, expired/revoked/replayed tokens, and every other bootstrap capability. Do not run it against Neon or a Vercel environment.

Before enabling the feature gate in a local environment, verify the target user and grant against the operator authorization and confirm the organization directory tests pass. Production activation remains subject to the separate Gate 0 evidence and deployment approval.

### Recovery

An expired, revoked, or consumed authorization cannot be reused. A database operator must independently verify the requester, issue a new one-time authorization with a new secret and reference, and record the recovery ticket in platform audit metadata. For emergency disablement, use the approved database-operator recovery procedure to disable the principal and record the operator reference in `PlatformAuditLog` in the same database transaction. Do not add a public recovery endpoint. Database-level audit immutability, role separation, and production recovery procedure remain unverified Gate 0 items.

## Licensing data

Platform purchases, entitlements, due schedule items, and payment history are separate tables from tenant invoices and customer/supplier payments. Organization and purchase relationships use restrictive deletion behavior, so suspension or revocation updates entitlement state and does not cascade into tenant data. Purchase schedules require explicit amounts and due dates. The code does not generate subscription cycles, verify or settle payments, calculate taxes/interest/fees, add grace periods, or change access based on dates or payment state.

`PlatformEntitlement.state` is explicit metadata (`PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`). Its state-change service requires a platform licensing capability, expected prior state, a decision reference, optimistic concurrency, and an atomic platform audit write. It does not itself alter tenant access. Only pending receipts can be recorded in the current payment service; no processor or payment-verification path is implemented. `SETTLED` is a stored accounting status consumed by a pure amount-due calculation and is not produced by this implementation.

The new migration is local source only and has not been applied. Enabling access from entitlements, automatic subscription renewal, payment verification and refunds, tax/interest/late fees, grace periods, legal terms, feature-to-license mapping, and suspension/revocation effects still require product, finance, and security decisions.
