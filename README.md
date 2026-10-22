# Budgetly

A private, mobile-first budget tracker built with Next.js, React, TypeScript, and MongoDB. Dark mode is the default on every screen.

## Run locally

Requires Node.js 22.13+ and a MongoDB instance (local MongoDB or Atlas).

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

- `MONGODB_URI`: your MongoDB connection string.
- `MONGODB_DB`: database name; defaults to `budgetly`.
- `AUTH_USERNAME` and `AUTH_PASSWORD`: the credentials for this single-user application.
- `SESSION_SECRET`: a random secret of at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `BUDGET_CURRENCY`: starting currency; defaults to `PKR`. Applied when the database is first initialized.
- `APP_ORIGIN` (optional): the public origin, such as `https://budget.example.com`, when hosting behind a reverse proxy. Requests from other origins are rejected.

```bash
npm run dev
```

Open http://localhost:3000 and sign in. Add an account and its current balance to get started. Restart the server after changing environment variables. No sample data or default working credentials are included.

## Features

- Bank, wallet, and cash accounts with current balances, names, and colors.
- Income, expenses, transfers, dates, categories, notes, search, and account/day/month filters. Quick Today and This month filters simplify daily tracking.
- Tap a transaction for full details. Edit standalone income, expense, and transfer entries, or undo recorded entries with their balance changes. Earlier versions remain in voided history.
- Monthly budgets: overall and category spending limits, remaining amounts, over-budget indicators, and a category breakdown. On mobile, open **More → Monthly budget**.
- Auditable balance corrections when reconciling an account.
- Weekly and monthly recurring expenses. Mark a bill paid to debit its account and advance the due date by one period. Bills never debit accounts automatically. Monthly expenses retain their original day where possible (January 31 → February 28 → March 31).
- Savings goals with purpose and target. Set aside, release, or spend savings held in a specific account.
- Debts in both directions, existing debts or newly lent/borrowed money, partial repayments, and editable names, notes, and due dates. Original amounts can be corrected on unpaid debts with no active linked transactions.
- A dashboard showing available money, total balances, reserved savings, monthly income/spending, recent activity, and the last seven days of spending.
- JSON data export in Settings and spreadsheet-safe CSV export of the filtered transaction list. The app does not currently import exports.
- Refresh on focus, reconnection, and once per minute while visible, plus a manual refresh button. Concurrent edits and stale balance reconciliations are rejected rather than silently overwriting newer activity.

## How balances work

Amounts are stored as integer minor units, with up to two decimal places. All accounts share one currency; changing the currency label does not convert amounts.

**Total balance** is the sum of your accounts. **Available to spend** is total balance minus money reserved for savings goals. Savings remain inside the account that holds them; they are not added to the total twice. Ordinary spending and transfers cannot consume reserved money. Release it or use the savings goal's Spend action.

Recording an existing debt changes no account balance. Select “This money is changing hands now” to record a new loan or borrowing and update an account. Repayments update the account and outstanding debt together. Loan principal and internal transfers are excluded from income/spending summaries. Opening balances and corrections are also excluded.

History is retained. Rename accounts as needed; accounts with transaction history cannot be deleted. Empty goals can be deleted, and removing a recurring bill retains its previous payments.

## Correcting mistakes and planning spending

Open an entry in Activity and choose **Edit transaction** or **Undo transaction**. Editing replaces the original entry atomically; undo marks it voided and reverses its recorded effects. Voided entries remain available under the Voided filter and are excluded from balances, charts, and budgets.

For linked entries recorded by this version, undo also restores the savings allocation, outstanding debt, or recurring due date. Dependent transactions sometimes need to be undone first: for example, undo repayments before undoing the original loan, and undo newer bill payments before older ones. Undo is refused if it would overdraw an account or consume reserved savings. Deleting a referenced goal or recurring expense prevents automatically restoring that deleted record. Older linked entries without reversal metadata require manual reconciliation; older standalone income/expenses/transfers remain editable and reversible.

Monthly limits are stored separately for each month and do not move money. Overall and category limits overlap; they are not added together. They warn when exceeded without preventing recording a real expense. Money set aside for savings is not spending; money spent from a savings goal is.

## Persistence and authentication

The server uses the official MongoDB driver. Credentials and the MongoDB URI are never sent to the browser. API routes require a signed, HTTP-only, same-site session cookie. Sessions last seven days; changing credentials or the session secret invalidates them. Production cookies require HTTPS. Mutations validate the request origin, input lengths, dates, amounts, account references, and available funds.

All data lives in one `budgets` document with `_id: personal`. Atomic document replacement with a revision check keeps accounts, goals, debts, and the ledger consistent without requiring a replica set. Recent request IDs prevent duplicate saves during network retries. MongoDB creates the collection on first use.

This is a single-owner application, not a multi-user service. The login attempt limiter is in process (10 attempts per minute); multi-instance public deployments should use shared rate limiting at the hosting layer. For very large histories, migrate the single document to a ledger collection before approaching MongoDB's document size limit. Back up your database regularly.

## Validation and production

```bash
npm run check  # unit tests, lint, and production build
npm start
```

The 36 unit tests cover monetary calculations, transfers, savings protection, debt accounting, recurring dates, corrections and reversals, duplicate requests, concurrent edit guards, monthly reports, CSV injection protection, authentication, and request validation. A deterministic 500-operation test checks balance invariants.

For full browser and real MongoDB integration checks:

```bash
npx playwright install chromium
npm run test:e2e
```

The integration test builds the app, creates an isolated temporary MongoDB instance, uses randomly generated test credentials, and checks mobile and desktop workflows. It does not connect to your configured database. The first run may download a MongoDB test binary. Screenshots are written to ignored `test-results/`; the browser, server, and temporary database are stopped afterward. Linux hosts may need browser system libraries (`npx playwright install --with-deps chromium`).

See [the audit report](docs/AUDIT.md) for the verified fixes, verification scope, and remaining limitations.

Deploy to a Node.js-compatible host, provide the same environment variables, enable HTTPS, and allow that host in your MongoDB network access settings. When using a reverse proxy, preserve the public request host and scheme, or set `APP_ORIGIN` to the exact public origin so origin checks match the browser. The application requires a running server and is not a static export.
