import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyCommand, emptyBudget, money, nextDue } from "../lib/budget";
import { available, goalBalance, type Budget } from "../lib/types";
function run(b: Budget, action: string, data: Record<string, unknown> = {}) {
  return applyCommand(b, {
    action,
    requestId: randomUUID(),
    date: "2026-10-21",
    expectedBalance: b.accounts.find((a) => a.id === data.accountId)?.balance,
    expectedRevision: b.revision,
    ...data,
  });
}
function setup() {
  let b = run(emptyBudget(), "account.save", {
    name: "Bank",
    kind: "bank",
    color: "mint",
    balance: "1000",
  });
  b = run(b, "account.save", {
    name: "Cash",
    kind: "cash",
    color: "peach",
    balance: "100",
  });
  return b;
}
function withGoal() {
  return run(setup(), "goal.save", {
    name: "Trip",
    target: "500",
    color: "purple",
  });
}
test("money uses integer minor units and rejects invalid precision and negatives", () => {
  assert.equal(money("0.29"), 29);
  assert.equal(money("1.1"), 110);
  assert.equal(money("0", true), 0);
  for (const input of ["-1", "NaN", "1.001", "1e3", "", 10, "0", "99999999999"])
    assert.throws(() => money(input));
});
test("income and expense change only the selected account", () => {
  const b = setup();
  const id = b.accounts[0].id;
  let next = run(b, "transaction.add", {
    type: "expense",
    amount: "10.29",
    title: "Lunch",
    category: "Food",
    accountId: id,
  });
  assert.equal(next.accounts[0].balance, 98971);
  assert.equal(next.accounts[1].balance, 10000);
  next = run(next, "transaction.add", {
    type: "income",
    amount: "100",
    title: "Pay",
    category: "Salary",
    accountId: id,
  });
  assert.equal(next.accounts[0].balance, 108971);
  assert.equal(b.accounts[0].balance, 100000);
});
test("transfer conserves total money and rejects the same account", () => {
  const b = setup();
  const data = {
    type: "transfer",
    amount: "200",
    title: "ATM",
    category: "Other",
    accountId: b.accounts[0].id,
    toAccountId: b.accounts[1].id,
  };
  const next = run(b, "transaction.add", data);
  assert.deepEqual(
    next.accounts.map((a) => a.balance),
    [80000, 30000],
  );
  assert.throws(() =>
    run(b, "transaction.add", { ...data, toAccountId: b.accounts[0].id }),
  );
});
test("saving reserves money without double-counting or changing account balances", () => {
  const b = withGoal();
  const id = b.accounts[0].id;
  const next = run(b, "goal.move", {
    id: b.goals[0].id,
    type: "saving",
    amount: "400",
    accountId: id,
  });
  assert.equal(next.accounts[0].balance, 100000);
  assert.equal(available(next, id), 60000);
  assert.equal(goalBalance(next.goals[0]), 40000);
  assert.throws(() =>
    run(next, "transaction.add", {
      type: "expense",
      amount: "601",
      title: "Too much",
      category: "Other",
      accountId: id,
    }),
  );
  assert.throws(() =>
    run(next, "account.adjust", { accountId: id, balance: "399" }),
  );
});
test("spending and releasing savings have different effects", () => {
  let b = withGoal();
  const id = b.accounts[0].id;
  const goal = b.goals[0].id;
  b = run(b, "goal.move", {
    id: goal,
    type: "saving",
    amount: "400",
    accountId: id,
  });
  b = run(b, "goal.move", {
    id: goal,
    type: "saving-spent",
    amount: "100",
    accountId: id,
  });
  assert.equal(b.accounts[0].balance, 90000);
  assert.equal(goalBalance(b.goals[0]), 30000);
  assert.equal(available(b, id), 60000);
  b = run(b, "goal.move", {
    id: goal,
    type: "release",
    amount: "100",
    accountId: id,
  });
  assert.equal(b.accounts[0].balance, 90000);
  assert.equal(goalBalance(b.goals[0]), 20000);
  assert.equal(available(b, id), 70000);
  assert.throws(() =>
    run(b, "goal.move", {
      id: goal,
      type: "saving-spent",
      amount: "1",
      accountId: b.accounts[1].id,
    }),
  );
  assert.throws(() => run(b, "goal.delete", { id: goal }));
});
test("new loans and partial repayment update balances and debt together", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "debt.add", {
    person: "Sam",
    direction: "owed",
    amount: "200",
    moveMoney: true,
    accountId,
  });
  assert.equal(b.accounts[0].balance, 80000);
  b = run(b, "debt.pay", { id: b.debts[0].id, amount: "75", accountId });
  assert.equal(b.accounts[0].balance, 87500);
  assert.equal(b.debts[0].paid, 7500);
  assert.throws(() =>
    run(b, "debt.pay", { id: b.debts[0].id, amount: "126", accountId }),
  );
});
test("existing debts do not change balances until repayment", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "debt.add", {
    person: "Alex",
    direction: "owe",
    amount: "50",
    moveMoney: false,
  });
  assert.equal(b.accounts[0].balance, 100000);
  b = run(b, "debt.pay", { id: b.debts[0].id, amount: "50", accountId });
  assert.equal(b.accounts[0].balance, 95000);
  assert.equal(b.debts[0].paid, 5000);
});
test("new borrowing adds money, and insufficient repayment changes nothing", () => {
  let b = setup();
  const accountId = b.accounts[1].id;
  b = run(b, "debt.add", {
    person: "Sam",
    direction: "owe",
    amount: "200",
    moveMoney: true,
    accountId,
  });
  assert.equal(b.accounts[1].balance, 30000);
  b = run(b, "transaction.add", {
    type: "expense",
    amount: "250",
    title: "Bill",
    category: "Other",
    accountId,
  });
  assert.throws(() =>
    run(b, "debt.pay", { id: b.debts[0].id, amount: "100", accountId }),
  );
  assert.equal(b.debts[0].paid, 0);
  assert.equal(b.accounts[1].balance, 5000);
});
test("recurring payment updates ledger and advances one period only", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "recurring.save", {
    name: "Subscription",
    amount: "20",
    frequency: "monthly",
    due: "2026-01-31",
    accountId,
    category: "Subscriptions",
  });
  assert.equal(b.accounts[0].balance, 100000);
  b = run(b, "recurring.pay", {
    id: b.recurring[0].id,
    expectedDue: "2026-01-31",
  });
  assert.equal(b.accounts[0].balance, 98000);
  assert.equal(b.recurring[0].due, "2026-02-28");
  assert.throws(() =>
    run(b, "recurring.pay", {
      id: b.recurring[0].id,
      expectedDue: "2026-01-31",
    }),
  );
  b = run(b, "recurring.pay", {
    id: b.recurring[0].id,
    expectedDue: "2026-02-28",
  });
  assert.equal(b.recurring[0].due, "2026-03-31");
});
test("monthly dates keep anchors and weekly dates cross year boundaries", () => {
  assert.equal(nextDue("2028-01-31", "monthly", 31), "2028-02-29");
  assert.equal(nextDue("2026-12-29", "weekly", 29), "2027-01-05");
});
test("editing a recurring expense retains its end-of-month anchor", () => {
  let b = setup();
  const data = {
    name: "Rent",
    amount: "10",
    frequency: "monthly",
    due: "2026-01-31",
    accountId: b.accounts[0].id,
    category: "Bills",
  };
  b = run(b, "recurring.save", data);
  const id = b.recurring[0].id;
  b = run(b, "recurring.pay", { id, expectedDue: "2026-01-31" });
  b = run(b, "recurring.save", {
    ...data,
    id,
    due: "2026-02-28",
    amount: "12",
  });
  b = run(b, "recurring.pay", { id, expectedDue: "2026-02-28" });
  assert.equal(b.recurring[0].due, "2026-03-31");
});
test("retrying the same request does not apply a transaction twice", () => {
  const b = setup();
  const command = {
    action: "transaction.add",
    requestId: "same-request",
    type: "expense",
    amount: "10",
    title: "Coffee",
    category: "Food",
    accountId: b.accounts[0].id,
    date: "2026-10-21",
  };
  const next = applyCommand(b, command);
  const retry = applyCommand(next, command);
  assert.equal(next, retry);
  assert.equal(retry.accounts[0].balance, 99000);
});
test("invalid dates and references do not mutate the budget", () => {
  const b = setup();
  const before = structuredClone(b);
  assert.throws(() =>
    run(b, "transaction.add", {
      type: "expense",
      amount: "10",
      title: "Bill",
      category: "Other",
      accountId: b.accounts[0].id,
      date: "2026-02-30",
    }),
  );
  assert.throws(() =>
    run(b, "transaction.add", {
      type: "income",
      amount: "10",
      title: "Pay",
      category: "Other",
      accountId: "missing",
    }),
  );
  assert.deepEqual(b, before);
});
test("account corrections are auditable and account history is retained", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "account.adjust", {
    accountId,
    balance: "900.50",
    note: "Reconciled",
  });
  assert.equal(b.accounts[0].balance, 90050);
  assert.equal(b.transactions[0].amount, -9950);
  assert.equal(b.transactions[0].type, "adjustment");
  assert.throws(() => run(b, "account.delete", { id: accountId }));
});

test("editing a transaction reverses the old entry and keeps an audit trail", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "transaction.add", {
    type: "expense",
    amount: "100",
    title: "Groceries",
    category: "Food & drinks",
    accountId,
    note: "Receipt",
  });
  const oldId = b.transactions[0].id;
  b = run(b, "transaction.edit", {
    id: oldId,
    type: "expense",
    amount: "80",
    title: "Correct groceries",
    category: "Food & drinks",
    accountId,
    note: "Receipt corrected",
  });
  assert.equal(b.accounts[0].balance, 92000);
  assert.equal(b.transactions[0].replacesId, oldId);
  assert.ok(b.transactions.find((t) => t.id === oldId)?.voidedAt);
  assert.equal(b.transactions[0].effects?.balances[0].delta, -8000);
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.equal(b.accounts[0].balance, 100000);
});
test("failed corrections leave the original transaction and balances intact", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "transaction.add", {
    type: "expense",
    amount: "100",
    title: "Lunch",
    category: "Food & drinks",
    accountId,
  });
  const before = structuredClone(b);
  assert.throws(() =>
    run(b, "transaction.edit", {
      id: b.transactions[0].id,
      type: "expense",
      amount: "1001",
      title: "Wrong",
      category: "Other",
      accountId,
    }),
  );
  assert.deepEqual(b, before);
});
test("editing income works even when the original income has been partly spent", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "transaction.add", {
    type: "income",
    amount: "100",
    title: "Pay",
    category: "Salary",
    accountId,
  });
  const id = b.transactions[0].id;
  b = run(b, "transaction.add", {
    type: "expense",
    amount: "1050",
    title: "Rent",
    category: "Other",
    accountId,
  });
  b = run(b, "transaction.edit", {
    id,
    type: "income",
    amount: "110",
    title: "Pay corrected",
    category: "Salary",
    accountId,
  });
  assert.equal(b.accounts[0].balance, 6000);
});
test("transfer undo conserves money and refuses an overdrawn destination", () => {
  let b = setup();
  const accountId = b.accounts[0].id,
    toAccountId = b.accounts[1].id;
  b = run(b, "transaction.add", {
    type: "transfer",
    amount: "200",
    title: "ATM",
    category: "Other",
    accountId,
    toAccountId,
  });
  const id = b.transactions[0].id;
  const restored = run(b, "transaction.undo", { id });
  assert.deepEqual(
    restored.accounts.map((a) => a.balance),
    [100000, 10000],
  );
  b = run(b, "transaction.add", {
    type: "expense",
    amount: "250",
    title: "Cash spent",
    category: "Other",
    accountId: toAccountId,
  });
  assert.throws(() => run(b, "transaction.undo", { id }));
});
test("savings undo restores allocations and prevents reversing dependent deposits", () => {
  let b = withGoal();
  const accountId = b.accounts[0].id,
    id = b.goals[0].id;
  b = run(b, "goal.move", { id, type: "saving", amount: "200", accountId });
  const deposit = b.transactions[0].id;
  b = run(b, "goal.move", {
    id,
    type: "saving-spent",
    amount: "50",
    accountId,
  });
  const spent = b.transactions[0].id;
  assert.throws(() => run(b, "transaction.undo", { id: deposit }));
  b = run(b, "transaction.undo", { id: spent });
  assert.equal(b.accounts[0].balance, 100000);
  assert.equal(goalBalance(b.goals[0]), 20000);
  b = run(b, "transaction.undo", { id: deposit });
  assert.equal(goalBalance(b.goals[0]), 0);
  assert.throws(() => run(b, "transaction.undo", { id: deposit }));
});
test("reversing a release refuses to re-reserve money that has been spent", () => {
  let b = withGoal();
  const accountId = b.accounts[0].id,
    id = b.goals[0].id;
  b = run(b, "goal.move", { id, type: "saving", amount: "1000", accountId });
  b = run(b, "goal.move", { id, type: "release", amount: "100", accountId });
  const release = b.transactions[0].id;
  b = run(b, "transaction.add", {
    type: "expense",
    title: "Lunch",
    category: "Other",
    amount: "100",
    accountId,
  });
  assert.throws(() => run(b, "transaction.undo", { id: release }));
});
test("recurring undo restores the schedule and requires newest payments first", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "recurring.save", {
    name: "Rent",
    amount: "10",
    frequency: "monthly",
    due: "2026-01-31",
    accountId,
    category: "Bills & utilities",
  });
  const id = b.recurring[0].id;
  b = run(b, "recurring.pay", { id, expectedDue: "2026-01-31" });
  const january = b.transactions[0].id;
  b = run(b, "recurring.pay", { id, expectedDue: "2026-02-28" });
  const february = b.transactions[0].id;
  assert.throws(() => run(b, "transaction.undo", { id: january }));
  b = run(b, "transaction.undo", { id: february });
  assert.equal(b.recurring[0].due, "2026-02-28");
  b = run(b, "transaction.undo", { id: january });
  assert.equal(b.recurring[0].due, "2026-01-31");
  assert.equal(b.accounts[0].balance, 100000);
});
test("loan and repayment undo maintain outstanding debt and account totals", () => {
  for (const direction of ["owed", "owe"]) {
    let b = setup();
    const accountId = b.accounts[0].id;
    b = run(b, "debt.add", {
      person: "Sam",
      direction,
      amount: "100",
      moveMoney: true,
      accountId,
    });
    const loan = b.transactions[0].id,
      id = b.debts[0].id;
    b = run(b, "debt.pay", { id, amount: "25", accountId });
    const repayment = b.transactions[0].id;
    assert.throws(() => run(b, "transaction.undo", { id: loan }));
    b = run(b, "transaction.undo", { id: repayment });
    assert.equal(b.debts[0].paid, 0);
    b = run(b, "transaction.undo", { id: loan });
    assert.equal(b.debts.length, 0);
    assert.equal(b.accounts[0].balance, 100000);
  }
});
test("legacy standalone transactions remain reversible without effects metadata", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "transaction.add", {
    type: "expense",
    title: "Old entry",
    category: "Other",
    amount: "10",
    accountId,
  });
  delete b.transactions[0].effects;
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.equal(b.accounts[0].balance, 100000);
});
test("stale balance corrections and edits are rejected, but retries remain idempotent", () => {
  const b = setup();
  const accountId = b.accounts[0].id;
  assert.throws(() =>
    run(b, "account.adjust", { accountId, balance: "100", expectedBalance: 1 }),
  );
  assert.throws(() =>
    run(b, "account.save", {
      id: accountId,
      name: "Changed",
      kind: "bank",
      color: "mint",
      expectedRevision: 0,
    }),
  );
  const requestId = "repeat-adjust";
  const next = run(b, "account.adjust", {
    accountId,
    balance: "900",
    requestId,
  });
  const retried = run(next, "account.adjust", {
    accountId,
    balance: "900",
    requestId,
    expectedBalance: 100000,
    expectedRevision: b.revision,
  });
  assert.deepEqual(retried, next);
});
test("debt editing preserves balances and disallows rewriting paid principal", () => {
  let b = setup();
  const accountId = b.accounts[0].id;
  b = run(b, "debt.add", { person: "Sam", direction: "owed", amount: "100" });
  const id = b.debts[0].id;
  b = run(b, "debt.edit", {
    id,
    person: "Sam Jones",
    amount: "120",
    note: "Old loan",
    due: "",
  });
  assert.equal(b.accounts[0].balance, 100000);
  assert.equal(b.debts[0].amount, 12000);
  b = run(b, "debt.pay", { id, amount: "10", accountId });
  assert.throws(() =>
    run(b, "debt.edit", { id, person: "Sam", amount: "130", due: "" }),
  );
  assert.throws(() => run(b, "debt.delete", { id }));
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  b = run(b, "debt.delete", { id });
  assert.equal(b.debts.length, 0);
});
test("monthly spending limits are upserted, scoped by month, and removable", () => {
  let b = setup();
  b = run(b, "limit.save", {
    month: "2026-10",
    category: "All spending",
    amount: "200",
  });
  b = run(b, "limit.save", {
    month: "2026-10",
    category: "All spending",
    amount: "300",
  });
  b = run(b, "limit.save", {
    month: "2026-11",
    category: "All spending",
    amount: "400",
  });
  assert.equal(b.spendingLimits?.length, 2);
  b = run(b, "limit.save", {
    month: "2026-10",
    category: "All spending",
    amount: "0",
  });
  assert.equal(b.spendingLimits?.length, 1);
  assert.equal(b.spendingLimits?.[0].month, "2026-11");
  assert.throws(() =>
    run(b, "limit.save", {
      month: "2026-13",
      category: "All spending",
      amount: "1",
    }),
  );
});
test("invalid currency configuration falls back safely and optional blank notes are allowed", () => {
  assert.equal(emptyBudget("bad-input").currency, "PKR");
  assert.equal(emptyBudget(" usd ").currency, "USD");
  const b = setup();
  assert.doesNotThrow(() =>
    run(b, "transaction.add", {
      type: "expense",
      amount: "1",
      title: "Test",
      category: "Other",
      accountId: b.accounts[0].id,
      note: "  ",
    }),
  );
  assert.throws(() =>
    run(b, "debt.add", {
      person: "Sam",
      amount: "1",
      direction: "owed",
      moveMoney: "true",
    }),
  );
  assert.throws(() =>
    run(b, "debt.add", {
      person: "Sam",
      amount: "1",
      direction: "owed",
      due: false,
    }),
  );
});
test("a deterministic mixed ledger never loses money through transfers, savings, or undo", () => {
  let b = withGoal();
  const a = b.accounts[0].id,
    c = b.accounts[1].id,
    g = b.goals[0].id;
  let seed = 17;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let i = 0; i < 500; i++) {
    const accountId = rand() % 2 ? a : c;
    const amount = String((rand() % 25) + 1);
    const before = structuredClone(b);
    const actions = [
      {
        action: "transaction.add",
        type: "transfer",
        amount,
        title: "Transfer",
        category: "Other",
        accountId,
        toAccountId: accountId === a ? c : a,
      },
      { action: "goal.move", id: g, type: "saving", amount, accountId },
      { action: "goal.move", id: g, type: "release", amount, accountId },
    ];
    const selected = actions[rand() % actions.length];
    try {
      b = run(b, selected.action, selected);
    } catch {
      assert.deepEqual(b, before);
    }
    assert.equal(
      b.accounts.reduce((s, a) => s + a.balance, 0),
      110000,
    );
    for (const account of b.accounts) assert.ok(available(b, account.id) >= 0);
    if (b !== before && b.revision !== before.revision && rand() % 4 === 0) {
      b = run(b, "transaction.undo", { id: b.transactions[0].id });
      assert.deepEqual(b.accounts, before.accounts);
      assert.equal(goalBalance(b.goals[0]), goalBalance(before.goals[0]));
    }
  }
});
