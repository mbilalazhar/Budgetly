import type { Budget } from "./types";

/** Calendar dates are passed by the client so reminders use its local day. */
export function upcomingPayments(budget: Budget, today: string) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const through = end.toISOString().slice(0, 10);
  const bills = budget.recurring.map((r) => ({
    id: r.id,
    kind: "bill" as const,
    title: r.name,
    due: r.due,
    amount: r.amount,
    incoming: false,
  }));
  const debts = budget.debts
    .filter((d) => d.due && d.paid < d.amount)
    .map((d) => ({
      id: d.id,
      kind: "debt" as const,
      title:
        d.direction === "owe" ? `Pay ${d.person}` : `Expected from ${d.person}`,
      due: d.due,
      amount: d.amount - d.paid,
      incoming: d.direction === "owed",
    }));
  const items = [...bills, ...debts]
    .filter((item) => item.due <= through)
    .sort(
      (a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title),
    );
  return {
    items,
    outgoing: items
      .filter((i) => !i.incoming)
      .reduce((sum, i) => sum + i.amount, 0),
    incoming: items
      .filter((i) => i.incoming)
      .reduce((sum, i) => sum + i.amount, 0),
  };
}
