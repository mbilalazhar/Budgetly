import { isSpending, type Budget, type Transaction } from "./types";

export function monthlySummary(budget: Budget, month: string) {
  const transactions = budget.transactions.filter(
    (t) => !t.voidedAt && t.date.startsWith(month),
  );
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions.filter(isSpending);
  const spent = expenses.reduce((sum, t) => sum + t.amount, 0);
  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>(
      (totals, t) => {
        totals[t.category] = (totals[t.category] || 0) + t.amount;
        return totals;
      },
      Object.create(null) as Record<string, number>,
    ),
  ).sort((a, b) => b[1] - a[1]);
  const limits = (budget.spendingLimits || [])
    .filter((limit) => limit.month === month)
    .map((limit) => {
      const used =
        limit.category === "All spending"
          ? spent
          : byCategory.find(([category]) => category === limit.category)?.[1] ||
            0;
      return { ...limit, used, remaining: limit.amount - used };
    });
  return { income, spent, byCategory, limits };
}

export function transactionsCsv(transactions: Transaction[], budget: Budget) {
  const cell = (value: string) => {
    // Prevent spreadsheet programs from interpreting user text as formulas.
    const safe =
      /^[\s]*[=+@\-\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value)
        ? `'${value}`
        : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = [
    [
      "Date",
      "Description",
      "Type",
      "Amount",
      "Currency",
      "Account",
      "To account",
      "Category",
      "Note",
      "Status",
    ],
  ];
  for (const t of transactions)
    rows.push([
      t.date,
      t.title,
      t.type,
      (t.amount / 100).toFixed(2),
      budget.currency,
      budget.accounts.find((a) => a.id === t.accountId)?.name || "",
      budget.accounts.find((a) => a.id === t.toAccountId)?.name || "",
      t.category,
      t.note,
      t.voidedAt ? "Voided" : "Recorded",
    ]);
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
