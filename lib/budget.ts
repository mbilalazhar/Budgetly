import { randomUUID } from "node:crypto";
import {
  available,
  colors,
  currencies,
  categories,
  canEditTransaction,
  goalBalance,
  reserved,
  type Budget,
  type Command,
  type Transaction,
} from "./types";
import { captureEffects, undoTransaction } from "./ledger";
export class ConflictError extends Error {}
export class ValidationError extends Error {}
const fail = (message: string): never => {
  throw new ValidationError(message);
};
function string(
  value: unknown,
  label: string,
  max = 100,
  optional = false,
): string {
  if (
    optional &&
    (value === undefined || (typeof value === "string" && !value.trim()))
  )
    return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    return fail(
      `${label} is required and must be under ${max + 1} characters.`,
    );
  return value.trim();
}
export function money(value: unknown, allowZero = false): number {
  if (typeof value !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(value))
    return fail("Enter an amount with no more than two decimal places.");
  const [whole, decimal = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if ((!allowZero && amount === 0) || amount > 999999999999)
    return fail("Enter a valid positive amount.");
  return amount;
}
function date(value: unknown, optional = false): string {
  if (optional && (value === undefined || value === "")) return "";
  const result = string(value, "Date", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    result < "1000-01-01" ||
    result > "9998-12-31" ||
    !Number.isFinite(new Date(result).getTime()) ||
    new Date(result).toISOString().slice(0, 10) !== result
  )
    return fail("Choose a valid date.");
  return result;
}
function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (!values.includes(value as T)) return fail(`Choose a valid ${label}.`);
  return value as T;
}
export function nextDue(
  due: string,
  frequency: "weekly" | "monthly",
  anchorDay: number,
): string {
  const parsed = new Date(`${due}T12:00:00Z`);
  if (frequency === "weekly") parsed.setUTCDate(parsed.getUTCDate() + 7);
  else {
    parsed.setUTCDate(1);
    parsed.setUTCMonth(parsed.getUTCMonth() + 1);
    const last = new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0),
    ).getUTCDate();
    parsed.setUTCDate(Math.min(anchorDay, last));
  }
  return parsed.toISOString().slice(0, 10);
}
export function emptyBudget(currency = "PKR"): Budget {
  return {
    revision: 0,
    currency: currencies.includes(currency.trim().toUpperCase())
      ? currency.trim().toUpperCase()
      : "PKR",
    accounts: [],
    goals: [],
    debts: [],
    recurring: [],
    transactions: [],
    requestIds: [],
    spendingLimits: [],
  };
}
export function applyCommand(original: Budget, command: Command): Budget {
  string(command.requestId, "Request ID", 80);
  if (command.moveMoney !== undefined && typeof command.moveMoney !== "boolean")
    fail("Choose whether this debt changes an account balance.");
  if (original.requestIds.includes(command.requestId)) return original;
  const b = structuredClone(original);
  let effectBaseline = original;
  if (
    command.expectedRevision !== undefined &&
    command.expectedRevision !== original.revision
  )
    throw new ConflictError(
      "Your budget changed in another tab. Close this form, refresh, and try again.",
    );
  const account = (id: unknown) =>
    b.accounts.find((item) => item.id === id) ??
    fail("Choose an existing account.");
  const spend = (id: string, amount: number) => {
    if (available(b, id) < amount)
      fail(
        "This account does not have enough available money. Release savings first if needed.",
      );
    account(id).balance -= amount;
  };
  const addTransaction = (data: Omit<Transaction, "id" | "createdAt">) =>
    b.transactions.unshift({
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
  const transaction = (
    data: Pick<Transaction, "type" | "title" | "amount" | "accountId"> &
      Partial<Transaction>,
  ) =>
    addTransaction({
      category: "Other",
      date: date(command.date),
      note: string(command.note, "Note", 500, true),
      ...data,
    });
  const recordPayment = () => {
    const type = choice(
      command.type,
      ["income", "expense", "transfer"],
      "transaction type",
    );
    const from = account(command.accountId);
    const amount = money(command.amount);
    const title = string(command.title, "Description", 100);
    let toAccountId: string | undefined;
    if (type === "income") from.balance += amount;
    else spend(from.id, amount);
    if (type === "transfer") {
      const to = account(command.toAccountId);
      if (to.id === from.id)
        fail("Choose two different accounts for a transfer.");
      to.balance += amount;
      toAccountId = to.id;
    }
    transaction({
      type,
      title,
      amount,
      accountId: from.id,
      toAccountId,
      category: string(command.category, "Category", 40),
    });
  };
  switch (command.action) {
    case "account.save": {
      const name = string(command.name, "Account name", 40);
      const kind = choice(
        command.kind,
        ["bank", "wallet", "cash"],
        "account type",
      );
      const color = choice(command.color, colors, "color");
      if (command.id) Object.assign(account(command.id), { name, kind, color });
      else {
        if (b.accounts.length >= 30) fail("You can create up to 30 accounts.");
        const balance = money(command.balance, true);
        const item = { id: randomUUID(), name, kind, color, balance };
        b.accounts.push(item);
        if (balance)
          transaction({
            type: "adjustment",
            title: `${name} opening balance`,
            amount: balance,
            accountId: item.id,
          });
      }
      break;
    }
    case "account.adjust": {
      const item = account(command.accountId);
      if (command.expectedBalance !== item.balance)
        throw new ConflictError(
          "This account balance changed. Close the form and refresh before reconciling it.",
        );
      const balance = money(command.balance, true);
      if (balance < reserved(b, item.id))
        fail(
          "Balance cannot be less than the savings reserved in this account.",
        );
      transaction({
        type: "adjustment",
        title: `${item.name} balance correction`,
        amount: balance - item.balance,
        accountId: item.id,
      });
      item.balance = balance;
      break;
    }
    case "account.delete": {
      const item = account(command.id);
      if (
        item.balance ||
        b.transactions.some(
          (t) => t.accountId === item.id || t.toAccountId === item.id,
        ) ||
        b.recurring.some((r) => r.accountId === item.id)
      )
        fail(
          "Only empty accounts without transactions or recurring expenses can be deleted.",
        );
      b.accounts = b.accounts.filter((a) => a.id !== item.id);
      break;
    }
    case "transaction.add": {
      recordPayment();
      break;
    }
    case "transaction.edit": {
      const old =
        b.transactions.find((t) => t.id === command.id) ??
        fail("Transaction not found.");
      if (!canEditTransaction(old))
        fail(
          "Only standalone income, expenses, and transfers can be edited. Undo a linked entry and record it again from its goal, debt, or bill.",
        );
      undoTransaction(b, old, fail);
      old.voidReason = "Replaced with a corrected entry";
      effectBaseline = structuredClone(b);
      recordPayment();
      b.transactions[0].replacesId = old.id;
      break;
    }
    case "transaction.undo": {
      const item =
        b.transactions.find((t) => t.id === command.id) ??
        fail("Transaction not found.");
      undoTransaction(b, item, fail);
      item.voidReason =
        string(command.note, "Reason", 500, true) || "Undone by owner";
      break;
    }
    case "goal.save": {
      const name = string(command.name, "Saving purpose", 60);
      const target = money(command.target);
      const color = choice(command.color, colors, "color");
      if (command.id) {
        const goal =
          b.goals.find((item) => item.id === command.id) ??
          fail("Savings goal not found.");
        Object.assign(goal, { name, target, color });
      } else
        b.goals.push({
          id: randomUUID(),
          name,
          target,
          color,
          allocations: [],
        });
      break;
    }
    case "goal.delete": {
      const goal =
        b.goals.find((item) => item.id === command.id) ??
        fail("Savings goal not found.");
      if (goalBalance(goal))
        fail("Spend or release the money in this goal before deleting it.");
      b.goals = b.goals.filter((item) => item.id !== goal.id);
      break;
    }
    case "goal.move": {
      const goal =
        b.goals.find((item) => item.id === command.id) ??
        fail("Savings goal not found.");
      const type = choice(
        command.type,
        ["saving", "release", "saving-spent"],
        "savings action",
      );
      const from = account(command.accountId);
      const amount = money(command.amount);
      let allocation = goal.allocations.find(
        (item) => item.accountId === from.id,
      );
      if (type === "saving") {
        if (available(b, from.id) < amount)
          fail("This account does not have enough available money to save.");
        if (!allocation) {
          allocation = { accountId: from.id, amount: 0 };
          goal.allocations.push(allocation);
        }
        allocation.amount += amount;
      } else {
        if (!allocation || allocation.amount < amount)
          return fail(
            "This goal does not hold that much money in the selected account.",
          );
        allocation.amount -= amount;
        if (type === "saving-spent") from.balance -= amount;
      }
      transaction({
        type,
        title: `${type === "saving" ? "Saved for" : type === "release" ? "Released from" : "Spent from"} ${goal.name}`,
        amount,
        accountId: from.id,
        category: "Savings",
        referenceId: goal.id,
      });
      break;
    }
    case "recurring.save": {
      const due = date(command.due);
      const data = {
        name: string(command.name, "Expense name", 60),
        amount: money(command.amount),
        frequency: choice(
          command.frequency,
          ["weekly", "monthly"],
          "frequency",
        ),
        due,
        accountId: account(command.accountId).id,
        category: string(command.category, "Category", 40),
      };
      if (command.id) {
        const item =
          b.recurring.find((item) => item.id === command.id) ??
          fail("Recurring expense not found.");
        const anchorDay =
          item.due === due ? item.anchorDay : Number(due.slice(8));
        Object.assign(item, data, { anchorDay });
      } else
        b.recurring.push({
          ...data,
          id: randomUUID(),
          anchorDay: Number(due.slice(8)),
        });
      break;
    }
    case "recurring.pay": {
      const item =
        b.recurring.find((item) => item.id === command.id) ??
        fail("Recurring expense not found.");
      if (item.due !== command.expectedDue)
        fail("This payment was already recorded. Refresh and try again.");
      spend(item.accountId, item.amount);
      transaction({
        type: "expense",
        title: item.name,
        amount: item.amount,
        accountId: item.accountId,
        category: item.category,
        referenceId: item.id,
      });
      item.due = nextDue(item.due, item.frequency, item.anchorDay);
      break;
    }
    case "recurring.delete": {
      if (!b.recurring.some((item) => item.id === command.id))
        fail("Recurring expense not found.");
      b.recurring = b.recurring.filter((item) => item.id !== command.id);
      break;
    }
    case "debt.add": {
      const direction = choice(
        command.direction,
        ["owed", "owe"],
        "debt direction",
      );
      const amount = money(command.amount);
      const person = string(command.person, "Person's name", 60);
      const debt = {
        id: randomUUID(),
        person,
        direction,
        amount,
        paid: 0,
        due: date(command.due, true),
        note: string(command.note, "Note", 500, true),
      };
      b.debts.push(debt);
      if (command.moveMoney === true) {
        const item = account(command.accountId);
        if (direction === "owed") spend(item.id, amount);
        else item.balance += amount;
        transaction({
          type: direction === "owed" ? "debt-out" : "debt-in",
          title:
            direction === "owed"
              ? `Lent to ${person}`
              : `Borrowed from ${person}`,
          amount,
          accountId: item.id,
          category: "Debt",
          referenceId: debt.id,
        });
      }
      break;
    }
    case "debt.edit": {
      const debt =
        b.debts.find((d) => d.id === command.id) ?? fail("Debt not found.");
      debt.person = string(command.person, "Person's name", 60);
      debt.due = date(command.due, true);
      debt.note = string(command.note, "Note", 500, true);
      const amount = money(command.amount);
      if (
        amount !== debt.amount &&
        (debt.paid ||
          b.transactions.some((t) => !t.voidedAt && t.referenceId === debt.id))
      )
        fail(
          "Undo this debt's payments and loan transaction before changing the original amount.",
        );
      debt.amount = amount;
      break;
    }
    case "debt.delete": {
      const debt =
        b.debts.find((d) => d.id === command.id) ?? fail("Debt not found.");
      if (
        debt.paid ||
        b.transactions.some((t) => !t.voidedAt && t.referenceId === debt.id)
      )
        fail("Undo the linked payments and loan before deleting this debt.");
      b.debts = b.debts.filter((d) => d.id !== debt.id);
      break;
    }
    case "limit.save": {
      const category = choice(
        command.category,
        ["All spending", ...categories, "Savings"],
        "spending category",
      );
      const amount = money(command.amount, true);
      const month = date(
        `${string(command.month, "Budget month", 7)}-01`,
      ).slice(0, 7);
      const id = `${month}:${category}`;
      b.spendingLimits = (b.spendingLimits || []).filter((l) => l.id !== id);
      if (amount) b.spendingLimits.push({ id, month, category, amount });
      break;
    }
    case "debt.pay": {
      const debt =
        b.debts.find((item) => item.id === command.id) ??
        fail("Debt not found.");
      const amount = money(command.amount);
      if (amount > debt.amount - debt.paid)
        fail("Payment is greater than the outstanding debt.");
      const item = account(command.accountId);
      if (debt.direction === "owe") spend(item.id, amount);
      else item.balance += amount;
      debt.paid += amount;
      transaction({
        type: debt.direction === "owe" ? "debt-out" : "debt-in",
        title:
          debt.direction === "owe"
            ? `Repaid ${debt.person}`
            : `Received from ${debt.person}`,
        amount,
        accountId: item.id,
        category: "Debt",
        referenceId: debt.id,
      });
      break;
    }
    case "settings.save": {
      const currency = string(command.currency, "Currency", 3).toUpperCase();
      if (!currencies.includes(currency)) fail("Choose a supported currency.");
      b.currency = currency;
      break;
    }
    default:
      fail("Unknown action.");
  }
  if (
    b.accounts.some(
      (a) =>
        !Number.isSafeInteger(a.balance) ||
        a.balance < reserved(b, a.id) ||
        a.balance > 999999999999,
    )
  )
    fail(
      "This change would leave an account below its reserved savings or outside the supported range. Undo dependent spending first.",
    );
  const existingIds = new Set(original.transactions.map((t) => t.id));
  for (const entry of b.transactions) {
    if (!existingIds.has(entry.id))
      entry.effects = captureEffects(effectBaseline, b);
  }
  b.revision++;
  b.requestIds = [...b.requestIds.slice(-199), command.requestId];
  return b;
}
