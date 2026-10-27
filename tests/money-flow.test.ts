import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyCommand, emptyBudget } from "../lib/budget";
import { balanceSummary, refundableAmount, type Budget } from "../lib/types";
import { monthlySummary } from "../lib/reports";
import { upcomingPayments } from "../lib/planning";
const run = (b: Budget, action: string, data: Record<string, unknown> = {}) =>
  applyCommand(b, {
    action,
    requestId: randomUUID(),
    date: "2026-10-27",
    ...data,
  });
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
    color: "blue",
    balance: "100",
  });
  b = run(b, "goal.save", {
    name: "Emergency",
    amount: "300",
    accountId: b.accounts[0].id,
    color: "mint",
  });
  b = run(b, "pot.save", {
    name: "Food",
    category: "Food & drinks",
    amount: "200",
  });
  return run(b, "pot.save", {
    name: "Travel",
    category: "Transport",
    amount: "100",
  });
}
const buy = (b: Budget, extra: Record<string, unknown> = {}) =>
  run(b, "transaction.add", {
    type: "expense",
    title: "Groceries",
    amount: "50",
    accountId: b.accounts[0].id,
    category: "Food & drinks",
    ...extra,
  });
test("moving money between pots preserves accounts, savings, free money, and reports", () => {
  const before = setup();
  let b = run(before, "pot.transfer", {
    id: before.pots![0].id,
    toPotId: before.pots![1].id,
    amount: "75",
  });
  assert.deepEqual(balanceSummary(b), balanceSummary(before));
  assert.deepEqual(b.accounts, before.accounts);
  assert.deepEqual(
    b.pots!.map((p) => p.balance),
    [12500, 17500],
  );
  assert.equal(monthlySummary(b, "2026-10").spent, 0);
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.deepEqual(b.pots, before.pots);
});
test("pot transfers reject invalid destinations, insufficient funds and dependent undo", () => {
  const before = setup();
  const move = {
    id: before.pots![0].id,
    toPotId: before.pots![1].id,
    amount: "75",
  };
  assert.throws(
    () => run(before, "pot.transfer", { ...move, toPotId: move.id }),
    /different/,
  );
  assert.throws(
    () => run(before, "pot.transfer", { ...move, toPotId: "missing" }),
    /destination/,
  );
  assert.throws(
    () => run(before, "pot.transfer", { ...move, amount: "201" }),
    /hold/,
  );
  let b = run(before, "pot.transfer", move);
  const id = b.transactions[0].id;
  b = buy(b, { category: "Transport", amount: "175" });
  assert.throws(() => run(b, "transaction.undo", { id }), /already been used/);
});
test("moving savings updates both accounts and allocations while keeping every summary unchanged", () => {
  const before = setup();
  let b = run(before, "goal.transfer", {
    id: before.goals[0].id,
    accountId: before.accounts[0].id,
    toAccountId: before.accounts[1].id,
    amount: "100",
  });
  assert.deepEqual(balanceSummary(b), balanceSummary(before));
  assert.deepEqual(
    b.accounts.map((a) => a.balance),
    [90000, 20000],
  );
  assert.deepEqual(
    b.goals[0].allocations.map((a) => a.amount),
    [20000, 10000],
  );
  assert.equal(monthlySummary(b, "2026-10").spent, 0);
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.deepEqual(b.accounts, before.accounts);
  assert.equal(b.goals[0].allocations[0].amount, 30000);
  assert.equal(b.goals[0].allocations[1].amount, 0);
});
test("savings transfer cannot use another fund or free money and cannot be undone after spending it", () => {
  const before = setup();
  const move = {
    id: before.goals[0].id,
    accountId: before.accounts[0].id,
    toAccountId: before.accounts[1].id,
    amount: "100",
  };
  assert.throws(
    () =>
      run(before, "goal.transfer", { ...move, toAccountId: move.accountId }),
    /different/,
  );
  assert.throws(
    () => run(before, "goal.transfer", { ...move, amount: "301" }),
    /hold/,
  );
  let b = run(before, "goal.transfer", move);
  const id = b.transactions[0].id;
  b = run(b, "goal.move", {
    id: before.goals[0].id,
    accountId: before.accounts[1].id,
    amount: "100",
    type: "saving-spent",
  });
  assert.throws(() => run(b, "transaction.undo", { id }), /already been spent/);
});
test("partial refunds credit the chosen account and original pot, without creating income", () => {
  const spent = buy(setup());
  const expense = spent.transactions[0];
  let b = run(spent, "transaction.refund", {
    id: expense.id,
    accountId: spent.accounts[1].id,
    amount: "20",
  });
  assert.equal(b.accounts[0].balance, spent.accounts[0].balance);
  assert.equal(b.accounts[1].balance, 12000);
  assert.equal(b.pots![0].balance, 17000);
  assert.equal(balanceSummary(b).free, balanceSummary(spent).free);
  assert.equal(refundableAmount(b, expense), 3000);
  assert.equal(monthlySummary(b, "2026-10").income, 0);
  assert.equal(monthlySummary(b, "2026-10").spent, 3000);
  b = run(b, "transaction.refund", {
    id: expense.id,
    accountId: spent.accounts[0].id,
    amount: "30",
  });
  assert.equal(refundableAmount(b, expense), 0);
  assert.equal(monthlySummary(b, "2026-10").spent, 0);
  assert.throws(
    () =>
      run(b, "transaction.refund", {
        id: expense.id,
        accountId: spent.accounts[0].id,
        amount: "0.01",
      }),
    /exceeds/,
  );
});
test("unassigned refunds restore free money and do not fund a new matching pot retroactively", () => {
  const spent = buy(setup(), { potId: "unassigned" });
  const b = run(spent, "transaction.refund", {
    id: spent.transactions[0].id,
    amount: "50",
    accountId: spent.accounts[1].id,
  });
  assert.equal(balanceSummary(b).free, balanceSummary(spent).free + 5000);
  assert.deepEqual(b.pots, spent.pots);
});
test("savings refunds remain protected even when returned to another account", () => {
  let b = setup();
  b = run(b, "goal.move", {
    id: b.goals[0].id,
    type: "saving-spent",
    accountId: b.accounts[0].id,
    amount: "50",
    category: "Health",
  });
  const beforeRefund = b;
  b = run(b, "transaction.refund", {
    id: b.transactions[0].id,
    accountId: b.accounts[1].id,
    amount: "20",
  });
  assert.deepEqual(
    b.goals[0].allocations.map((a) => a.amount),
    [25000, 2000],
  );
  assert.equal(
    balanceSummary(b).spendable,
    balanceSummary(beforeRefund).spendable,
  );
  assert.equal(b.accounts[1].balance, 12000);
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.deepEqual(balanceSummary(b), balanceSummary(beforeRefund));
});
test("refunds are dated when received, can produce negative monthly spending, and cannot predate expense", () => {
  const spent = buy(setup());
  const data = {
    id: spent.transactions[0].id,
    accountId: spent.accounts[0].id,
    amount: "50",
  };
  assert.throws(
    () => run(spent, "transaction.refund", { ...data, date: "2026-10-26" }),
    /before/,
  );
  const b = run(spent, "transaction.refund", { ...data, date: "2026-11-01" });
  assert.equal(monthlySummary(b, "2026-10").spent, 5000);
  assert.equal(monthlySummary(b, "2026-11").spent, -5000);
  assert.deepEqual(monthlySummary(b, "2026-11").byCategory, [
    ["Food & drinks", -5000],
  ]);
});
test("undo refunds before correcting the original; duplicate refund requests are idempotent", () => {
  const spent = buy(setup());
  const id = spent.transactions[0].id;
  const command = {
    action: "transaction.refund",
    requestId: randomUUID(),
    date: "2026-10-27",
    id,
    accountId: spent.accounts[0].id,
    amount: "50",
  };
  let b = applyCommand(spent, command);
  assert.equal(applyCommand(b, command), b);
  assert.throws(() => run(b, "transaction.undo", { id }), /refunds/);
  assert.throws(
    () =>
      run(b, "transaction.edit", {
        id,
        type: "expense",
        title: "Correction",
        amount: "25",
        accountId: spent.accounts[0].id,
        category: "Food & drinks",
      }),
    /refunds/,
  );
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.deepEqual(balanceSummary(b), balanceSummary(spent));
  assert.equal(refundableAmount(b, spent.transactions[0]), 5000);
  b = run(b, "transaction.undo", { id });
  assert.equal(b.pots![0].balance, 20000);
});
test("invalid refunds cannot target income, other refunds, voided expenses or removed funds", () => {
  let b = buy(setup());
  const id = b.transactions[0].id;
  const data = { amount: "1", accountId: b.accounts[0].id };
  assert.throws(
    () =>
      run(b, "transaction.refund", { ...data, id: b.transactions.at(-1)!.id }),
    /exceeds/,
  );
  b = run(b, "transaction.refund", { ...data, id });
  assert.throws(
    () => run(b, "transaction.refund", { ...data, id: b.transactions[0].id }),
    /exceeds/,
  );
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  b = run(b, "transaction.undo", { id });
  assert.throws(() => run(b, "transaction.refund", { ...data, id }), /exceeds/);
  b = buy(b);
  const latest = b.transactions[0].id;
  b = run(b, "pot.move", {
    id: b.pots![0].id,
    type: "reserve-release",
    amount: "150",
  });
  b = run(b, "pot.delete", { id: b.pots![0].id });
  assert.throws(
    () => run(b, "transaction.refund", { ...data, id: latest }),
    /removed/,
  );
});
test("refunding a recurring bill does not change its next due date", () => {
  let b = setup();
  b = run(b, "recurring.save", {
    name: "Delivery",
    amount: "50",
    frequency: "weekly",
    due: "2026-10-27",
    accountId: b.accounts[0].id,
    category: "Food & drinks",
  });
  b = run(b, "recurring.pay", {
    id: b.recurring[0].id,
    expectedDue: "2026-10-27",
  });
  b = run(b, "transaction.refund", {
    id: b.transactions[0].id,
    accountId: b.accounts[0].id,
    amount: "50",
  });
  assert.equal(b.recurring[0].due, "2026-11-03");
  assert.equal(b.pots![0].balance, 20000);
});
test("due reminders include overdue and seven calendar days, exclude settled debts and keep expected money separate", () => {
  let b = setup();
  for (const [name, due] of [
    ["Overdue", "2026-10-20"],
    ["Today", "2026-10-27"],
    ["Last day", "2026-11-02"],
    ["Later", "2026-11-03"],
  ])
    b = run(b, "recurring.save", {
      name,
      due,
      amount: "10",
      frequency: "monthly",
      accountId: b.accounts[0].id,
      category: "Other",
    });
  b = run(b, "debt.add", {
    person: "Alex",
    direction: "owe",
    amount: "20",
    due: "2026-10-28",
  });
  b = run(b, "debt.add", {
    person: "Sam",
    direction: "owed",
    amount: "30",
    due: "2026-10-29",
  });
  b = run(b, "debt.add", { person: "Undated", direction: "owe", amount: "40" });
  const before = balanceSummary(b);
  const reminders = upcomingPayments(b, "2026-10-27");
  assert.equal(reminders.items.length, 5);
  assert.equal(reminders.items[0].title, "Overdue");
  assert.equal(reminders.outgoing, 5000);
  assert.equal(reminders.incoming, 3000);
  assert.deepEqual(balanceSummary(b), before);
  b = run(b, "debt.pay", {
    id: b.debts[0].id,
    amount: "20",
    accountId: b.accounts[0].id,
  });
  assert.equal(upcomingPayments(b, "2026-10-27").outgoing, 3000);
});
