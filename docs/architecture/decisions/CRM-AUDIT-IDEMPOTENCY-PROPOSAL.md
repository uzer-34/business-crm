# Opportunity transition, audit, idempotency, and event contract proposal

**Status:** ARCHITECTURE DIRECTION ACCEPTED — implementation not authorized  
**Prepared:** 2026-10-11  
**Scope:** Contracts only. No event/outbox infrastructure, application code, schema, or migration is added.

Decision status is summarized in the [CRM and Gate 0 decision register](CRM-GATE0-DECISION-REGISTER.md).

## Approved direction

The user approved atomic transition/history writes, optimistic concurrency, explicit conflict behavior, idempotency keys, separate Activity/AuditLog purposes, and no outbox/event bus for the first slice. This document records the implementation contract; it grants no implementation authority.

## Current repository facts

- `Activity` is the customer-facing business timeline. It currently uses `subjectType`/`subjectId`, with a real optional Customer foreign key for the Customer case.
- `AuditLog` is a separate append-only security/compliance trail with actor, action, target, metadata, and timestamp.
- Neither model currently provides an Opportunity stage-transition history or a general idempotency contract.
- Existing `Task` is the reusable follow-up system; no typed Opportunity link exists today.

## Transition contract for implementation planning

### Canonical records and atomic write

For an accepted stage change, one database transaction should:

1. Verify active tenant context, capabilities, record scope, expected Opportunity/enrollment version, and allowed transition.
2. Update the Pipeline-owned typed enrollment's current stage and increment its version using compare-and-swap semantics.
3. Append one immutable stage-transition history record with tenant, typed enrollment/Opportunity reference, pipeline version, from/to stage IDs, actor user and membership, timestamp, request/idempotency key, correlation ID, and any approved reason or transition metadata.
4. Append the corresponding user-facing Activity entry with a documented type and safe metadata.
5. Append the corresponding security AuditLog entry with action, target, actor, and audit-safe metadata.

All five writes commit or roll back together. Activity is not the source of truth for stage state; transition history is. AuditLog remains security-facing and must not be used as the customer timeline. Do not put credentials, sensitive personal data, or unrestricted request bodies in either metadata field.

Potential constraints (schema proposal only): unique idempotency key per organization and command scope; history rows reference the typed enrollment and versioned stages; tenant columns on related records agree; update and history append are in one transaction.

### Concurrent updates

Each command supplies the expected current stage and transition version read by the client. The authoritative update is conditional on that expected version/current stage. Exactly one concurrent update wins; a stale request returns a conflict requiring refresh and user review. It must not silently retry against a different current stage or skip an allowed edge.

Alternative: lock the enrollment row for each transition. This can be correct but increases lock duration and does not by itself make retried requests idempotent. Recommendation: optimistic version check/conditional update with a short transaction; use a row lock only if the approved database semantics require it.

### Retry and idempotency

- The caller supplies a stable idempotency key for one logical stage-change command; the server scopes it to organization and command type and validates its size/format.
- First accepted request stores the key and result with the transition.
- A retry with the same key and same normalized payload returns the original transition result without a second Activity/AuditLog entry.
- Reuse of the same key with a different Opportunity, target stage, or payload returns a conflict.
- A request without a key is not guaranteed retry-safe; for any externally retried command, require one.
- The guarantee is “one committed effect per idempotency key,” not global exactly-once delivery.

Unique-constraint races must be resolved by reading the already committed result and comparing the normalized payload; do not catch all database errors as successful duplicates.

## Audit and event-name contract

Proposed audit action: `crm.opportunity.stage_transitioned`. Record immutable transition history as the domain record; write a matching Activity and AuditLog entry in the same transaction. The exact metadata allowlist and retention policy require approval.

Candidate event name/schema for a future consumer contract (documentation only; not registered as an emitted event and not part of the first slice):

| Field | Proposed value |
| --- | --- |
| Event name | `crm.opportunity.stage_transitioned` |
| Schema version | `1` |
| Producer/owner | Pipeline for the transition fact; CRM owns Opportunity lifecycle payload semantics |
| Required identifiers | organization ID, Opportunity ID, typed enrollment ID, transition ID, pipeline ID/version, from-stage ID, to-stage ID |
| Actor and time | actor user ID, membership ID, occurred-at UTC timestamp |
| Retry identity | transition ID and command idempotency key |
| Data rule | identifiers and approved transition metadata only; no copied secrets or unnecessary customer PII |
| Delivery | not decided; no publisher/outbox is proposed in this package |

This candidate name does not imply that the application emits, persists, or delivers an integration event. The first slice uses transactionally persisted transition history, Activity, and AuditLog only. If external consumers later require durable delivery, prepare a separate ADR comparing an outbox, database notifications, or another approved mechanism. Do not add an outbox, inbox, event broker, or generic event framework without that decision.

## Alternatives considered

| Option | Benefits | Risks | Assessment |
| --- | --- | --- | --- |
| Atomic transition row + Activity + AuditLog; no event delivery | Small, replayable, audit-consistent first slice | Future subscribers need a separate delivery design | Recommended |
| Emit an event after transaction without an outbox | Minimal code | Crash between commit and publish loses event; retry may duplicate | Reject for reliable integrations |
| Add a generic outbox now | Durable delivery foundation | Adds schema, dispatch, retry, ordering, monitoring, and operational ownership before a consumer exists | Defer pending ADR |
| Activity only | Reuses timeline | Mutable/general timeline is insufficient as canonical, typed transition history and security evidence | Reject |

## Risks and unresolved questions

- Should history retain the actor membership ID if the membership is later removed? Recommended: retain immutable actor user ID and a snapshot of approved role/membership identifiers, with FK deletion behavior that never erases history.
- What fields and reasons are required for each transition? Configuration should be versioned and immutable after use.
- Are pipeline transition history and CRM close-won/lost history the same command? Recommended: terminal outcome is a CRM lifecycle command composed with a permitted terminal transition atomically, after closing semantics are approved.
- What is the idempotency-key scope and retention period? Recommended: organization + command namespace, retained for at least as long as transition history or for an explicitly approved retry horizon.
- Keep Activity and AuditLog purposes distinct and authorize their visibility independently; both records are mandatory parts of the atomic transition command in this slice.
- Is there an existing event registry to extend? None was identified in the repository review. The candidate catalog entry above is documentation only.
- Who owns event schema compatibility, retention, delivery ordering, and replay if integrations are later approved?

## Recommendation and remaining contract questions

Use atomic conditional stage update + immutable transition history + Activity + AuditLog, with optimistic concurrency and same-key retry semantics. Treat transition history as the canonical domain fact. Do not publish an event in the first slice and do not create outbox infrastructure until a consumer and delivery guarantee are separately approved.

Before implementation, settle actor-reference retention after membership removal, exact transition metadata allowlists, and idempotency-key retention. Event-name/schema registration is deferred and excluded from the first slice; an outbox/event delivery mechanism requires a separate architecture decision. The user-approved direction does not authorize code, schema, migration, event registration, or delivery infrastructure.
