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

- A collapsible getting-started guide with live balance explanations, completion indicators, and quick actions for expenses, income, reservations, and account transfers.
- Bank, wallet, and cash accounts with current balances, names, and colors.
- Income, expenses, transfers, dates, categories, notes, search, and account/pot/day/month filters. Each pot links directly to its activity. Quick Today and This month filters simplify daily tracking.
- Tap a transaction for full details. Edit standalone income, expense, and transfer entries, or undo recorded entries with their balance changes. Earlier versions remain in voided history.
- Spending pots: reserve existing money for food, bills, or a named task, then spend from it gradually using any account. Add or release funds at any time; balances carry forward without a monthly reset. Open **Spending pots** (on mobile, **More → Spending pots**). Optional monthly limits and reports remain available in an expandable section.
- Move money directly between spending pots without changing account balances or free money.
- Partial and full refunds linked to original expenses, with money returned to the original pot or savings fund when applicable. Reports show expenses minus refunds.
- Auditable balance corrections when reconciling an account.
- Weekly and monthly recurring expenses. Mark a bill paid to debit its account and advance the due date by one period. Bills never debit accounts automatically. Monthly expenses retain their original day where possible (January 31 → February 28 → March 31).
- Savings balances with an optional target. Enter existing savings when creating a fund, add more later, release money, or explicitly use **Spend savings**. There is no monthly contribution requirement.
- Transfer protected savings between accounts in one step. Each savings card lists the accounts holding it.
- Due-soon and overdue reminders combine the next scheduled bill payments and outstanding dated debts, with received repayments shown separately. Reminders never move money automatically.
- Debts in both directions, existing debts or newly lent/borrowed money, partial repayments, and editable names, notes, and due dates. Original amounts can be corrected on unpaid debts with no active linked transactions.
- A dashboard separating total balance, spendable balance, protected savings, reserved spending pots, and free money, alongside monthly income/spending and recent activity.
- JSON data export in Settings and spreadsheet-safe CSV export of the filtered transaction list. The app does not currently import exports.
- Refresh on focus, reconnection, and once per minute while visible, plus a manual refresh button. Concurrent edits and stale balance reconciliations are rejected rather than silently overwriting newer activity.

## How balances work

Amounts are stored as integer minor units, with up to two decimal places. All accounts share one currency; changing the currency label does not convert amounts.

**Accounts** track where money is held. **Spending pots** track what it is reserved for, independently of accounts. **Savings** track money protected from ordinary spending.

- **Total balance** = all account balances, including savings.
- **Spendable balance** = total minus savings. This includes money reserved in spending pots.
- **Free to assign or spend** = spendable minus money remaining in pots.

For example, 550,000 across accounts with 100,000 in savings and 10,000 reserved for food gives 450,000 spendable and 440,000 free. A 1,000 food expense leaves 549,000 total and 9,000 in the food pot, while free money remains 440,000. Only the account used to pay loses 1,000.

Choose a pot in the expense form, or select a category to automatically use its pot. If several pots share a category, choose one explicitly. A pot cannot go below zero: add money or explicitly choose unassigned money instead. Bills follow the same rules. Transfers between accounts leave pots and total balance unchanged. Reservations and releases are recorded in activity but are not income or spending.

When adding existing savings, first include that money in the account’s current balance, then use **Add savings → Already saved** to mark it as protected. Savings stay inside their accounts and are never counted twice. Targets are optional and do not represent monthly requirements. Ordinary expenses, loans, transfers, and balance corrections cannot consume protected savings. Use **Spend savings** to deliberately pay from savings, or release the money first. Spending savings reduces the savings balance, paying account, and total together; it leaves spending pots unchanged.

To change a reservation, open a pot’s **Add / release → Move to pot** action. This changes the purpose of the money without changing any account balance. To record savings moved between bank accounts, use **Move savings to another account** on the savings card. Both account balances and the saved amounts move together, with savings still protected. These actions record transfers you have already made; Budgetly does not initiate bank payments.

Recording an existing debt changes no account balance. Select “This money is changing hands now” to record a new loan or borrowing and update an account. Repayments update the account and outstanding debt together. Loan principal and internal transfers are excluded from income/spending summaries. Opening balances and corrections are also excluded.

Existing data remains compatible: documents without spending pots are treated as having none. Existing savings targets and monthly limits are preserved; limits are not silently converted into reserved money.

History is retained. Rename accounts as needed; accounts with transaction history cannot be deleted. Empty goals can be deleted, and removing a recurring bill retains its previous payments.

## Correcting mistakes and planning spending

Open an entry in Activity and choose **Edit transaction** or **Undo transaction**. Editing replaces the original entry atomically; undo marks it voided and reverses its recorded effects. Voided entries remain available under the Voided filter and are excluded from balances, charts, and budgets.

For entries recorded by this version, undo also restores spending pots, savings allocations, outstanding debt, or recurring due dates. Editing a pot-funded expense first restores its old pot and account effects, then applies the replacement atomically. Dependent transactions sometimes need to be undone first: for example, undo repayments before undoing the original loan, and undo newer bill payments before older ones. Undo is refused if it would overdraw an account or consume reserved savings. Deleting a referenced pot, savings fund, or recurring expense prevents automatically restoring that deleted record. Older linked entries without reversal metadata require manual reconciliation; older standalone income/expenses/transfers remain editable and reversible.

Monthly limits are stored separately for each month and do not move money. Overall and category limits overlap; they are not added together. They warn when exceeded without preventing recording a real expense. Money set aside for savings is not spending; money spent from a savings goal is.

## Returns and refunds

Open the original expense in Activity and choose **Record refund**. Select the account that actually received the money, its amount, and the date received. A refund can be partial and cannot exceed the original expense minus earlier active refunds. Money returns to its original spending pot; refunds for savings spending return to the same savings fund in the receiving account. Refunds for unassigned spending become free money.

Refunds reduce category spending on their recorded date, rather than counting as income or rewriting the original purchase date. A month with more refunds than purchases can have negative net spending. Refunding a recurring bill does not change its due date. Undo refund entries before editing or undoing the original expense. Undoing a refund is refused if its returned money has already been consumed and the reversal would break balance protections. Refunds cannot automatically restore a deleted pot or savings fund.

## Everyday workflow

1. Add the actual balances of your bank, cash, and wallets. Include existing savings once.
2. Mark protected savings and reserve pots if useful; both are optional.
3. Use Home’s quick actions to record income or expenses. The expandable guide explains your actual balances.
4. Review **Due soon & overdue** for the next bill payments and outstanding debts due today through the next six calendar days, plus overdue items. Expected repayments are not part of your balance until received.
5. Use Activity to inspect a payment, record a refund, or correct a mistake. Use **View pot activity** to follow money reserved, spent, released, moved, or refunded for a task.

## Persistence and authentication

The server uses the official MongoDB driver. Credentials and the MongoDB URI are never sent to the browser. API routes require a signed, HTTP-only, same-site session cookie. Sessions last seven days; changing credentials or the session secret invalidates them. Production cookies require HTTPS. Mutations validate the request origin, input lengths, dates, amounts, account references, and available funds.

All data lives in one `budgets` document with `_id: personal`. Atomic document replacement with a revision check keeps accounts, goals, debts, and the ledger consistent without requiring a replica set. Recent request IDs prevent duplicate saves during network retries. MongoDB creates the collection on first use.

This is a single-owner application, not a multi-user service. The login attempt limiter is in process (10 attempts per minute); multi-instance public deployments should use shared rate limiting at the hosting layer. For very large histories, migrate the single document to a ledger collection before approaching MongoDB's document size limit. Back up your database regularly.

## Validation and production

```bash
npm run check  # unit tests, lint, and production build
npm start
```

The 61 unit tests cover monetary calculations, transfers, savings protection, debt accounting, recurring dates, corrections and reversals, duplicate requests, concurrent edit guards, spending pot funding and reversals, existing savings without targets, protected savings transfers, pot reallocations, refunds and dependent reversals, reminder date boundaries, monthly reports, CSV injection protection, authentication, and request validation. A deterministic 500-operation test checks balance invariants.

For full browser and real MongoDB integration checks:

```bash
npx playwright install chromium
npm run test:e2e
```

The integration test builds the app, creates an isolated temporary MongoDB instance, uses randomly generated test credentials, and checks mobile and desktop workflows. It does not connect to your configured database. The first run may download a MongoDB test binary. Screenshots are written to ignored `test-results/`; the browser, server, and temporary database are stopped afterward. Linux hosts may need browser system libraries (`npx playwright install --with-deps chromium`).

See [the audit report](docs/AUDIT.md) for the verified fixes, verification scope, and remaining limitations.

Deploy to a Node.js-compatible host, provide the same environment variables, enable HTTPS, and allow that host in your MongoDB network access settings. When using a reverse proxy, preserve the public request host and scheme, or set `APP_ORIGIN` to the exact public origin so origin checks match the browser. The application requires a running server and is not a static export.
