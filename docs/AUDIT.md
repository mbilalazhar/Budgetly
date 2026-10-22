# Repository audit — 21 October 2026

The review covered the application screens and forms, API routes, authentication, MongoDB persistence, financial command logic, reporting, configuration, dependencies, and tests. It found and fixed concrete issues; passing tests are evidence for the checked behavior, not a guarantee that no possible defect exists.

## Fixed

- Balance corrections now check the balance the user actually saw. Sensitive edits reject stale revisions instead of overwriting activity from another tab. Concurrent MongoDB writes still use atomic revision-checked replacements.
- Transaction edits and undo reverse monetary effects atomically and preserve the original entry as voided history. Linked reversals restore goals, debt repayment amounts, and bill due dates when their dependencies still exist. Savings and available-funds checks apply to reversals too.
- Summaries, charts, and budgets exclude voided entries. Transfers, loan principal, balance adjustments, and savings allocations are kept out of expense totals.
- Browser refresh requests cannot replace newer state with older results or repopulate a logged-out session. Authentication refresh clears open financial dialogs when a session expires.
- Request IDs work when visiting a development server from a phone over LAN HTTP, where `crypto.randomUUID` may be unavailable.
- Debt note editing preserves the existing note. Optional whitespace-only notes are accepted; invalid optional dates and string-valued debt movement flags are rejected.
- Currency configuration is normalized on first initialization, preventing malformed configuration from crashing currency formatting.
- Session signatures distinguish credential boundaries, so changing username/password to another pair with the same concatenated text still invalidates old sessions.
- An explicit `APP_ORIGIN` supports reverse-proxy hosting while retaining strict origin checks.
- Category reports safely handle unusual legacy category names, including names matching JavaScript object properties.
- CSV output escapes quotes/newlines and neutralizes formula-like text while preserving numeric amounts.
- Generated test output is excluded from lint and application type scanning. React effect lint failures were fixed.

## Practical additions

- Monthly overall and category budgets, category spending breakdowns, and over-budget/remaining indicators.
- Full transaction inspection, corrections, undo confirmations, and a voided-history filter.
- Debt detail editing and deletion of unlinked, unpaid debt records.
- Day filtering, Today/This month shortcuts, clear filters, and filtered CSV export.
- Refresh on focus/reconnection, periodic foreground refresh, and a manual refresh control.
- Repeatable browser/MongoDB tests in the repository, plus `npm run check` for unit tests, lint, and build.

## Verification

- `npm test`: 36 tests passed, including a deterministic 500-operation ledger invariant check.
- `npm run lint`: passed without warnings.
- `npm run build`: passed with TypeScript validation.
- Browser integration against temporary MongoDB: login/logout, authorization/origin rejection, account creation, income, expenses, transfers, savings allocation/spending/release, recurring payments, partial debt repayments, MongoDB concurrency/idempotency, persistence after reload, corrections/undo, linked reversals, monthly budgets, CSV download, debt editing, stale reconciliation, and request-ID fallback passed.
- Responsive checks passed at 320, 390, 768, and 1440 pixels. Screenshots were reviewed for mobile login, dashboard, and monthly budgeting.
- Production dependency audit: no known vulnerabilities reported.

## Remaining limitations and dependency advisory

The full dependency audit reports five high-severity findings in one development-only chain: `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. The underlying issue is [deeply nested pattern stack exhaustion in braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The registry's latest `braces` version is 3.0.3 and remains affected. npm proposes downgrading the Next.js ESLint configuration to 14.2.35, which does not match this Next.js 16 project; that downgrade was not applied. This dependency is not part of the production application runtime. Recheck when a compatible upstream fix is released.

This remains a single-owner, single-currency app. Login throttling is in process; multi-instance public hosting should add shared rate limiting. Its atomic single-document MongoDB storage has a document-size ceiling, so a very large history should be migrated to separate ledger storage. Keep database backups. JSON import/restore, bank synchronization, background bill notifications, multi-currency conversion, and offline transaction queues are not implemented. They are possible future enhancements, not implied by the current controls.

Existing financial data is not migrated destructively. Entries recorded before reversal metadata existed may not support automatic linked undo; the UI explains this, and manual reconciliation remains available.
