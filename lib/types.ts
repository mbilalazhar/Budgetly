export type Account = {
  id: string;
  name: string;
  kind: "bank" | "wallet" | "cash";
  balance: number;
  color: string;
};
export type Goal = {
  id: string;
  name: string;
  target: number;
  allocations: { accountId: string; amount: number }[];
  color: string;
};
// Spending pots describe a purpose, independently of the account paying for it.
export type SpendingPot = {
  id: string;
  name: string;
  category: string;
  balance: number;
};
export type Debt = {
  id: string;
  person: string;
  direction: "owed" | "owe";
  amount: number;
  paid: number;
  due: string;
  note: string;
};
export type Recurring = {
  id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "monthly";
  due: string;
  anchorDay: number;
  accountId: string;
  category: string;
};
export type Transaction = {
  id: string;
  type:
    | "income"
    | "expense"
    | "transfer"
    | "saving"
    | "release"
    | "saving-spent"
    | "debt-in"
    | "debt-out"
    | "reserve"
    | "reserve-release"
    | "reserve-transfer"
    | "saving-transfer"
    | "refund"
    | "adjustment";
  title: string;
  amount: number;
  accountId: string;
  toAccountId?: string;
  category: string;
  date: string;
  createdAt: string;
  note: string;
  referenceId?: string;
  potId?: string;
  toPotId?: string;
  refundOfId?: string;
  voidedAt?: string;
  voidReason?: string;
  replacesId?: string;
  effects?: TransactionEffects;
};
export type TransactionEffects = {
  balances: { accountId: string; delta: number }[];
  allocations: { goalId: string; accountId: string; delta: number }[];
  pots?: { potId: string; delta: number }[];
  debtPaid?: { debtId: string; delta: number };
  createdDebtId?: string;
  recurring?: { id: string; before: string; after: string };
};
export type SpendingLimit = {
  id: string;
  month: string;
  category: string;
  amount: number;
};
export type Budget = {
  revision: number;
  currency: string;
  accounts: Account[];
  goals: Goal[];
  debts: Debt[];
  recurring: Recurring[];
  transactions: Transaction[];
  requestIds: string[];
  spendingLimits?: SpendingLimit[];
  pots?: SpendingPot[];
};
export type Command = {
  action: string;
  requestId: string;
  [key: string]: unknown;
};
export const categories = [
  "Food & drinks",
  "Shopping",
  "Transport",
  "Bills & utilities",
  "Subscriptions",
  "Health",
  "Entertainment",
  "Education",
  "Salary",
  "Other",
];
export const colors = ["mint", "purple", "blue", "peach"];
export const currencies = [
  "PKR",
  "USD",
  "EUR",
  "GBP",
  "INR",
  "AED",
  "SAR",
  "CAD",
  "AUD",
];
export const isSpending = (t: Transaction) =>
  !t.voidedAt && ["expense", "saving-spent", "refund"].includes(t.type);
export const spendingAmount = (t: Transaction) =>
  t.type === "refund" ? -t.amount : t.amount;
export const refundableAmount = (budget: Budget, t: Transaction) =>
  t.voidedAt || !["expense", "saving-spent"].includes(t.type)
    ? 0
    : t.amount -
      budget.transactions
        .filter((r) => !r.voidedAt && r.refundOfId === t.id)
        .reduce((sum, r) => sum + r.amount, 0);
export const canEditTransaction = (t: Transaction) =>
  !t.voidedAt &&
  !t.referenceId &&
  ["income", "expense", "transfer"].includes(t.type);
export const canUndoTransaction = (t: Transaction) =>
  !t.voidedAt && (!!t.effects || canEditTransaction(t));
export const goalBalance = (goal: Goal) =>
  goal.allocations.reduce((sum, item) => sum + item.amount, 0);
export const reserved = (budget: Budget, accountId: string) =>
  budget.goals.reduce(
    (sum, goal) =>
      sum +
      goal.allocations
        .filter((item) => item.accountId === accountId)
        .reduce((total, item) => total + item.amount, 0),
    0,
  );
export const available = (budget: Budget, accountId: string) =>
  (budget.accounts.find((item) => item.id === accountId)?.balance ?? 0) -
  reserved(budget, accountId);
export function balanceSummary(budget: Budget) {
  const total = budget.accounts.reduce((sum, a) => sum + a.balance, 0);
  const savings = budget.goals.reduce((sum, g) => sum + goalBalance(g), 0);
  const pots = (budget.pots || []).reduce((sum, p) => sum + p.balance, 0);
  return {
    total,
    savings,
    pots,
    spendable: total - savings,
    free: total - savings - pots,
  };
}
