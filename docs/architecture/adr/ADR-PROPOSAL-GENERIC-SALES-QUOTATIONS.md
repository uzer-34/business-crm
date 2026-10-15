# ADR proposal: generic Sales quotations

**Status:** DECIDED — generic quotations remain deferred; repository rule unchanged  
**Prepared:** 2026-10-11  
**Decision owner:** Product/architecture owner  
**Scope:** Decision record proposal only. No quote workflow, schema, migration, or behavior is changed.

The accepted exclusion is also recorded in the [CRM and Gate 0 decision register](../decisions/CRM-GATE0-DECISION-REGISTER.md).

## Context and conflict

The repository's `docs/ARCHITECTURE.md` explicitly defers draft/quote workflows and says generic Sales has no quote/cart path; estimates are deferred to the Automobile Workshop phase. Existing Sales creates persisted Orders directly, and invoices are generated from Orders. There is no Quote or QuoteVersion model.

The supplied BOS V2 architecture assigns Quotes and QuoteVersions to Sales and includes Quotation in its candidate CRM first slice. That candidate slice is still marked for review. The two directions conflict. The later BOS proposal does not automatically replace the repository's explicit deferral.

## Decision

The user explicitly directed that the repository's no-quotation rule remain unchanged. Select option A for the current CRM slice. Generic quotations are excluded; this ADR does not authorize quote work. The remaining alternatives are preserved for a future, explicitly requested reversal.

## Alternatives

### A. Keep generic quotes deferred (recommended now)

Continue using the existing direct Order workflow. Do not change `docs/ARCHITECTURE.md`'s no-quote rule or the first CRM slice. Revisit after target market, quote lifecycle, currency, tax, discount, and approval policies are settled.

**Benefits:** respects the current repository scope; avoids financial semantics guessed from UI references; keeps CRM opportunity separate from a financial commitment.  
**Costs:** no formal customer-facing proposal document in the generic core; users may need an approved industry-specific process.

### B. Approve a generic Sales Quote / QuoteVersion workflow

Sales owns a mutable draft container and immutable issued/accepted versions with line and calculation snapshots. A CRM Opportunity may link to a Quote, but CRM does not own pricing or quote conversion. Only an approved/accepted version can convert through a Sales-owned command into an Order.

**Benefits:** reuse across industries; preserves what was offered at a point in time; clear separation from Opportunity pipeline.  
**Costs:** substantial policy surface for money/tax/discounting, revisions, approvals, numbering, expiry, currency, legal terms, and conversion. It changes the repository's current architecture rule.

### C. Add a CRM-only indicative proposal

Store an unpriced or indicative expected value on the Opportunity and no quote document/workflow.

**Benefits:** supports pipeline forecasting without creating a financial document.  
**Costs:** cannot safely present as an offer, calculate totals, or convert reliably; users may mistake forecast data for approved pricing. This is not a generic quotation substitute.

### D. Add quotations only to an approved industry module

For example, build a workshop estimate when that vertical's actual labor/parts, tax, and approval rules are defined.

**Benefits:** matches the repository's earlier deferral and allows a real vertical to define needed fields.  
**Costs:** no generic quotes across all industries and may lead to multiple workflows if shared policy is not later extracted.

## Financial and operational implications if option B is approved

Before implementation, product/accounting owners must decide:

- **Currency:** organization currency versus quote-specific currency; supported currency precision; exchange-rate source, timestamp, and whether a rate is locked on issue. Never silently recalculate an issued quote from current settings.
- **Amounts and rounding:** Decimal precision for quantity, unit price, discounts, tax, and totals; per-line versus document rounding; inclusive/exclusive tax; rounding mode; negative/zero values; and display rules. Avoid binary floating-point for money.
- **Tax:** jurisdiction and place-of-supply, tax registration, exemptions, taxable base, compound taxes, tax-inclusive pricing, tax changes between quote and order, and whether a quote is informational or tax-binding. The company must not infer a tax rule from the user's locale or UI reference.
- **Discounts:** line and document-level discounts, stacking order, percentage versus fixed amount, caps, discount permission, approval thresholds, and whether acceptance freezes them.
- **Catalog and snapshots:** immutable descriptions, unit prices, quantity, tax code/rate, discounts, currency, totals, terms, customer identity/contact snapshot, and quote version at issue. Catalog edits must not rewrite sent versions.
- **Lifecycle:** draft, issued/sent, accepted, rejected, expired, superseded, and cancelled states; who may perform each transition; expiry/acceptance timing; audit trail; revision after issue; and whether acceptance requires a signature or evidence.
- **Numbering:** tenant- and optionally branch-scoped sequential numbers must be concurrency-safe and never reused after issuance/cancellation, if legal or operational policy requires it.
- **Reporting:** distinguish forecast Opportunity value from issued quote total and accepted contract amount. A quote cannot silently become pipeline value.

These are unresolved product/accounting decisions. No tax advice or universal financial rule is assumed here.

## Order conversion behavior if option B is approved

Recommendation for a future implementation:

1. Convert only a specifically identified, accepted, current QuoteVersion (or an explicitly permitted partial-conversion version) to an Order.
2. In one Sales-owned transaction, verify tenant/customer scope and quote state, preserve the quote's approved line/pricing/tax snapshots, and invoke a composable Sales order-creation command. Do not duplicate or bypass Sales validation.
3. Store a durable source-version → Order relation with a uniqueness rule so a retry returns the same Order instead of creating another.
4. Do not create an Invoice, Payment, fulfillment, or inventory movement as a side effect of quote acceptance or conversion. Those remain separate existing lifecycles.
5. If current `createOrderAction` cannot be safely composed within the conversion transaction, first extract/review a Sales domain command as an approved implementation step; do not call a UI action from another domain action.
6. Define partial conversion, multiple orders from one quote, order edits after conversion, refunds/cancellations, and quote reactivation explicitly before enabling them.

## Recommendation

Choose **A: keep generic quotations deferred for now**, consistent with `docs/ARCHITECTURE.md`. Keep the first CRM slice to Customer/Lead → Opportunity → configured pipeline stage changes → Task/Activity. Capture the BOS V2 proposal as a conflict for later review. If generic quotation receives explicit product approval, resolve the financial/tax/discount/approval questions above, then update the no-quote rule through an accepted ADR before implementation.

## Consequences and risks

- The CRM first slice will not create or send a price offer and cannot convert an Opportunity to an Order through a quote.
- Opportunity expected value remains a forecast field and must not be represented as a tax-calculated quote total.
- Delaying a generic workflow may mean a later industry module has bespoke estimate rules; domain boundaries should be reviewed before extracting common policy.
- Approving option B without currency, pricing, discount, tax, approval, revision, and conversion rules risks incorrect customer commitments and accounting records.

## Unresolved questions

- Which launch industry and jurisdiction should define the first real quote use case?
- Do users need an internal estimate, a customer-facing proposal, or a legally accepted offer?
- Which currency and tax assumptions must be snapshotted, and who owns those policies?
- Are document-level discounts, approval thresholds, and manual overrides required?
- Who can issue, approve, send, accept, revise, expire, and convert a quote?
- Are partial order conversions or multiple orders from one accepted version valid?
- What evidence constitutes acceptance, and what retention/audit rules apply?

## Exact approval needed

Current decision: **option A, keep generic quotes deferred**. To reverse it later, the owner must explicitly approve option B and authorize changing the repository's no-quote rule, then resolve the financial/tax and lifecycle policies. The current CRM/Pipeline approval excludes quotations and does not authorize implementation.
