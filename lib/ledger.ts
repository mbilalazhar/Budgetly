import {
  canEditTransaction,
  type Budget,
  type Transaction,
  type TransactionEffects,
} from "./types";

export function captureEffects(
  before: Budget,
  after: Budget,
): TransactionEffects {
  const effects: TransactionEffects = { balances: [], allocations: [] };
  for (const account of after.accounts) {
    const delta =
      account.balance -
      (before.accounts.find((a) => a.id === account.id)?.balance || 0);
    if (delta) effects.balances.push({ accountId: account.id, delta });
  }
  for (const goal of after.goals)
    for (const allocation of goal.allocations) {
      const old =
        before.goals
          .find((g) => g.id === goal.id)
          ?.allocations.find((a) => a.accountId === allocation.accountId)
          ?.amount || 0;
      if (allocation.amount !== old)
        effects.allocations.push({
          goalId: goal.id,
          accountId: allocation.accountId,
          delta: allocation.amount - old,
        });
    }
  for (const debt of after.debts) {
    const old = before.debts.find((d) => d.id === debt.id);
    if (!old) effects.createdDebtId = debt.id;
    else if (old.paid !== debt.paid)
      effects.debtPaid = { debtId: debt.id, delta: debt.paid - old.paid };
  }
  for (const recurring of after.recurring) {
    const old = before.recurring.find((r) => r.id === recurring.id);
    if (old && old.due !== recurring.due)
      effects.recurring = {
        id: recurring.id,
        before: old.due,
        after: recurring.due,
      };
  }
  return effects;
}

export function undoTransaction(
  budget: Budget,
  t: Transaction,
  fail: (message: string) => never,
) {
  if (t.voidedAt) return fail("This transaction has already been undone.");
  let effects = t.effects;
  // Entries created before reversal metadata existed can still be safely
  // reversed when they have no relationship to a goal, debt, or schedule.
  if (!effects && canEditTransaction(t)) {
    effects = {
      balances: [
        {
          accountId: t.accountId,
          delta: t.type === "income" ? t.amount : -t.amount,
        },
      ],
      allocations: [],
    };
    if (t.type === "transfer" && t.toAccountId)
      effects.balances.push({ accountId: t.toAccountId, delta: t.amount });
  }
  if (!effects)
    return fail(
      "This older linked entry has no reversal details. Correct the account balance and manage its goal, debt, or schedule separately.",
    );
  if (effects.createdDebtId) {
    const debt =
      budget.debts.find((d) => d.id === effects.createdDebtId) ??
      fail("The original debt no longer exists.");
    if (
      debt.paid ||
      budget.transactions.some(
        (other) =>
          other.id !== t.id && !other.voidedAt && other.referenceId === debt.id,
      )
    )
      return fail(
        "Undo the repayments for this debt before undoing the original loan.",
      );
    budget.debts = budget.debts.filter((d) => d.id !== debt.id);
  }
  if (effects.debtPaid) {
    const debt =
      budget.debts.find((d) => d.id === effects.debtPaid!.debtId) ??
      fail("The original debt no longer exists.");
    if (debt.paid < effects.debtPaid.delta)
      return fail("The debt has changed. Refresh before undoing this payment.");
    debt.paid -= effects.debtPaid.delta;
  }
  if (effects.recurring) {
    const schedule =
      budget.recurring.find((r) => r.id === effects.recurring!.id) ??
      fail(
        "Recreate the deleted recurring expense before correcting it manually; its original schedule cannot be restored.",
      );
    if (schedule.due !== effects.recurring.after)
      return fail(
        "The bill schedule has changed. Undo its newer payments first, or correct the balance manually.",
      );
    schedule.due = effects.recurring.before;
  }
  for (const change of effects.allocations) {
    const goal =
      budget.goals.find((g) => g.id === change.goalId) ??
      fail(
        "The original savings goal no longer exists. Correct the balance manually.",
      );
    let allocation = goal.allocations.find(
      (a) => a.accountId === change.accountId,
    );
    if (!allocation) {
      allocation = { accountId: change.accountId, amount: 0 };
      goal.allocations.push(allocation);
    }
    if (allocation.amount - change.delta < 0)
      return fail(
        "This saved money has already been spent or released. Undo those later entries first.",
      );
    allocation.amount -= change.delta;
  }
  for (const change of effects.balances) {
    const account =
      budget.accounts.find((a) => a.id === change.accountId) ??
      fail("The original account no longer exists.");
    account.balance -= change.delta;
  }
  t.voidedAt = new Date().toISOString();
}
