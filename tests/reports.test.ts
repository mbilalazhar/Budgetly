import test from "node:test";
import assert from "node:assert/strict";
import { emptyBudget } from "../lib/budget";
import { monthlySummary, transactionsCsv } from "../lib/reports";
import type { Transaction } from "../lib/types";
const entry = (
  type: Transaction["type"],
  amount: number,
  category = "Food & drinks",
): Transaction => ({
  id: Math.random().toString(),
  type,
  amount,
  category,
  accountId: "a",
  title: "Test",
  date: "2026-10-21",
  createdAt: "2026-10-21T00:00:00Z",
  note: "",
});
test("reports exclude voided entries, loan principal, transfers, and unspent savings", () => {
  const b = emptyBudget();
  b.transactions = [
    entry("income", 10000),
    entry("expense", 1000),
    entry("saving-spent", 500, "Savings"),
    entry("debt-in", 3000),
    entry("debt-out", 1000),
    entry("transfer", 2000),
    entry("saving", 4000),
    entry("adjustment", 10000),
    { ...entry("expense", 2000), voidedAt: "2026-10-21" },
  ];
  b.spendingLimits = [
    { id: "a", month: "2026-10", category: "All spending", amount: 1200 },
    { id: "b", month: "2026-11", category: "All spending", amount: 3000 },
  ];
  const result = monthlySummary(b, "2026-10");
  assert.equal(result.income, 10000);
  assert.equal(result.spent, 1500);
  assert.equal(result.limits.length, 1);
  assert.equal(result.limits[0].remaining, -300);
  assert.equal(monthlySummary(b, "2026-11").spent, 0);
});
test("CSV escapes quotes, lines, and spreadsheet formulas without corrupting numeric amounts", () => {
  const b = emptyBudget();
  b.accounts = [
    {
      id: "a",
      name: '=HYPERLINK("bad")',
      kind: "bank",
      balance: 0,
      color: "mint",
    },
  ];
  const t = {
    ...entry("adjustment", -1234),
    title: "=1+1",
    note: 'a,"quoted"\nline',
  };
  const csv = transactionsCsv([t], b);
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"-12.34"'));
  assert.ok(csv.includes('a,""quoted""\nline'));
  assert.ok(csv.includes("\"'=HYPERLINK"));
});
test("unusual legacy category names cannot interfere with report totals", () => {
  const b = emptyBudget();
  b.transactions = [
    entry("expense", 100, "__proto__"),
    entry("expense", 200, "constructor"),
  ];
  assert.deepEqual(monthlySummary(b, "2026-10").byCategory, [
    ["constructor", 200],
    ["__proto__", 100],
  ]);
});
