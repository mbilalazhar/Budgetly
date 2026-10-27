import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyCommand, emptyBudget } from "../lib/budget";
import { balanceSummary, type Budget } from "../lib/types";
import { monthlySummary } from "../lib/reports";
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
    balance: "500000",
    color: "mint",
  });
  b = run(b, "account.save", {
    name: "Cash",
    kind: "cash",
    balance: "50000",
    color: "blue",
  });
  b = run(b, "goal.save", {
    name: "Savings",
    amount: "100000",
    accountId: b.accounts[0].id,
    color: "mint",
  });
  return run(b, "pot.save", {
    name: "Food",
    category: "Food & drinks",
    amount: "10000",
  });
}
function expense(b: Budget, data: Record<string, unknown> = {}) {
  return run(b, "transaction.add", {
    type: "expense",
    title: "Lunch",
    category: "Food & drinks",
    amount: "1000",
    accountId: b.accounts[1].id,
    ...data,
  });
}
test("550k total includes 100k savings and 10k reserved; food expense updates all three balances", () => {
  const before = setup();
  assert.deepEqual(balanceSummary(before), {
    total: 55000000,
    savings: 10000000,
    pots: 1000000,
    spendable: 45000000,
    free: 44000000,
  });
  assert.equal(before.goals[0].target, 0);
  const b = expense(before);
  assert.deepEqual(balanceSummary(b), {
    total: 54900000,
    savings: 10000000,
    pots: 900000,
    spendable: 44900000,
    free: 44000000,
  });
  assert.equal(b.accounts[0].balance, 50000000);
  assert.equal(b.accounts[1].balance, 4900000);
  assert.equal(b.transactions[0].potId, b.pots![0].id);
  assert.equal(monthlySummary(b, "2026-10").spent, 100000);
  assert.equal(before.pots![0].balance, 1000000);
});
test("pots span accounts, carry forward across months, and survive transfers", () => {
  let b = expense(setup(), { date: "2026-11-01" });
  b = expense(b, { accountId: b.accounts[0].id });
  const summary = balanceSummary(b);
  b = run(b, "transaction.add", {
    type: "transfer",
    title: "ATM",
    category: "Other",
    amount: "5000",
    accountId: b.accounts[0].id,
    toAccountId: b.accounts[1].id,
  });
  assert.deepEqual(balanceSummary(b), summary);
  assert.equal(b.pots![0].balance, 800000);
});
test("overspending a pot fails atomically even when the account has money", () => {
  const b = setup();
  assert.throws(
    () => expense(b, { amount: "10001" }),
    /pot does not have enough/,
  );
  assert.equal(b.pots![0].balance, 1000000);
  const next = expense(b, { amount: "10001", potId: "unassigned" });
  assert.equal(next.pots![0].balance, 1000000);
});
test("reserved funds cannot be consumed through other expenses, savings, corrections, or debt", () => {
  const b = setup();
  const accountId = b.accounts[0].id;
  assert.throws(
    () => expense(b, { accountId, category: "Other", amount: "440001" }),
    /unassigned/,
  );
  assert.throws(
    () =>
      run(b, "pot.move", {
        id: b.pots![0].id,
        type: "reserve",
        amount: "440001",
      }),
    /unassigned/,
  );
  assert.throws(() =>
    run(b, "goal.move", {
      id: b.goals[0].id,
      accountId,
      type: "saving",
      amount: "440001",
    }),
  );
  const reduced = run(b, "account.adjust", {
    accountId,
    expectedBalance: b.accounts[0].balance,
    balance: "100000",
  });
  assert.throws(
    () =>
      run(reduced, "account.adjust", {
        accountId: b.accounts[1].id,
        expectedBalance: b.accounts[1].balance,
        balance: "0",
      }),
    /reserved/,
  );
  assert.throws(() =>
    run(b, "debt.add", {
      direction: "owed",
      person: "Friend",
      amount: "440001",
      moveMoney: true,
      accountId,
    }),
  );
});
test("a pot cannot bypass protected savings in the paying account", () => {
  let b = setup();
  b = run(b, "goal.move", {
    id: b.goals[0].id,
    type: "saving",
    accountId: b.accounts[1].id,
    amount: "50000",
  });
  assert.throws(() => expense(b), /available/);
});
test("spending savings is explicit, reduces total and savings, and leaves pots and free money unchanged", () => {
  const before = setup();
  const b = run(before, "goal.move", {
    id: before.goals[0].id,
    type: "saving-spent",
    accountId: before.accounts[0].id,
    amount: "1000",
    category: "Health",
  });
  const a = balanceSummary(before),
    c = balanceSummary(b);
  assert.equal(c.total, a.total - 100000);
  assert.equal(c.savings, a.savings - 100000);
  assert.equal(c.free, a.free);
  assert.equal(c.pots, a.pots);
  assert.deepEqual(monthlySummary(b, "2026-10").byCategory, [
    ["Health", 100000],
  ]);
});
test("pot additions and releases are reversible and not spending or income", () => {
  const original = setup();
  let b = run(original, "pot.move", {
    id: original.pots![0].id,
    type: "reserve-release",
    amount: "2000",
  });
  assert.equal(balanceSummary(b).free, balanceSummary(original).free + 200000);
  assert.equal(monthlySummary(b, "2026-10").spent, 0);
  assert.equal(monthlySummary(b, "2026-10").income, 0);
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.deepEqual(balanceSummary(b), balanceSummary(original));
  b = run(b, "pot.move", { id: b.pots![0].id, type: "reserve", amount: "500" });
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.deepEqual(balanceSummary(b), balanceSummary(original));
});
test("expense editing and undo restore pot and account balances exactly", () => {
  const original = setup();
  let b = expense(original);
  b = run(b, "transaction.edit", {
    id: b.transactions[0].id,
    type: "expense",
    title: "Correct lunch",
    category: "Food & drinks",
    amount: "2000",
    accountId: b.accounts[0].id,
    potId: b.pots![0].id,
  });
  assert.equal(b.accounts[1].balance, original.accounts[1].balance);
  assert.equal(b.pots![0].balance, 800000);
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.deepEqual(balanceSummary(b), balanceSummary(original));
  assert.equal(monthlySummary(b, "2026-10").spent, 0);
});
test("undoing a reservation after spending it rejects; duplicate requests do not add twice", () => {
  const original = setup();
  const reservation = original.transactions[0].id;
  let b = expense(original);
  assert.throws(
    () => run(b, "transaction.undo", { id: reservation }),
    /already been used/,
  );
  const command = {
    action: "pot.move",
    requestId: randomUUID(),
    date: "2026-10-27",
    id: b.pots![0].id,
    type: "reserve",
    amount: "1000",
  };
  b = applyCommand(b, command);
  assert.equal(applyCommand(b, command), b);
});
test("ambiguous category requires a pot choice; explicit choice must match category", () => {
  let b = setup();
  b = run(b, "pot.save", {
    name: "Party food",
    category: "Food & drinks",
    amount: "2000",
  });
  assert.throws(() => expense(b), /Choose which/);
  b = expense(b, { potId: b.pots![1].id });
  assert.equal(b.pots![0].balance, 1000000);
  assert.equal(b.pots![1].balance, 100000);
  assert.throws(
    () => expense(b, { category: "Other", potId: b.pots![1].id }),
    /category/,
  );
  assert.throws(() => expense(b, { potId: "missing" }), /existing/);
});
test("recurring payment consumes a pot and undo restores pot, account and due date", () => {
  let b = setup();
  b = run(b, "recurring.save", {
    name: "Lunch delivery",
    amount: "1000",
    frequency: "weekly",
    due: "2026-10-27",
    accountId: b.accounts[1].id,
    category: "Food & drinks",
  });
  const before = b;
  b = run(b, "recurring.pay", {
    id: b.recurring[0].id,
    expectedDue: "2026-10-27",
  });
  assert.equal(b.pots![0].balance, 900000);
  assert.equal(b.recurring[0].due, "2026-11-03");
  b = run(b, "transaction.undo", { id: b.transactions[0].id });
  assert.deepEqual(balanceSummary(b), balanceSummary(before));
  assert.equal(b.recurring[0].due, "2026-10-27");
});
test("legacy documents without pots and old goal targets remain compatible", () => {
  let b = setup();
  delete b.pots;
  b = expense(b);
  assert.deepEqual(b.pots, []);
  assert.equal(b.transactions[0].potId, undefined);
  assert.equal(balanceSummary(b).pots, 0);
});
test("deleting a funded pot is blocked and undo cannot reallocate released money already spent", () => {
  let b = setup();
  assert.throws(() => run(b, "pot.delete", { id: b.pots![0].id }), /release/);
  b = run(b, "pot.move", {
    id: b.pots![0].id,
    type: "reserve-release",
    amount: "10000",
  });
  const releaseId = b.transactions[0].id;
  b = expense(b, {
    category: "Other",
    potId: "unassigned",
    amount: "400000",
    accountId: b.accounts[0].id,
  });
  b = expense(b, { category: "Other", potId: "unassigned", amount: "50000" });
  assert.throws(
    () => run(b, "transaction.undo", { id: releaseId }),
    /reserved/,
  );
  assert.equal(run(b, "pot.delete", { id: b.pots![0].id }).pots!.length, 0);
});
