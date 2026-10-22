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
  voidedAt?: string;
  voidReason?: string;
  replacesId?: string;
  effects?: TransactionEffects;
};
export type TransactionEffects = {
  balances: { accountId: string; delta: number }[];
  allocations: { goalId: string; accountId: string; delta: number }[];
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
  !t.voidedAt && (t.type === "expense" || t.type === "saving-spent");
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
