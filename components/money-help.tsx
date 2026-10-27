"use client";
import { balanceSummary, type Budget } from "@/lib/types";
import { upcomingPayments } from "@/lib/planning";
import { Icon } from "./icons";

export function MoneyGuide({
  budget,
  fmt,
  go,
}: {
  budget: Budget;
  fmt: (amount: number) => string;
  go: (step: "accounts" | "savings" | "budgets" | "expense") => void;
}) {
  const balances = balanceSummary(budget);
  const steps = [
    {
      id: "accounts" as const,
      title: "Add what you have today",
      description:
        "Enter each bank, wallet, or cash balance once. Include money you already keep as savings.",
      done: budget.accounts.length > 0,
      label: "Set up accounts",
    },
    {
      id: "savings" as const,
      title: "Protect your savings (optional)",
      description:
        "Mark part of an account as savings. This does not add new money or require a monthly target.",
      done: balances.savings > 0,
      label: "Set up savings",
    },
    {
      id: "budgets" as const,
      title: "Reserve money for tasks (optional)",
      description:
        "Give food, bills, or a task its own pot. Unused money stays there next month.",
      done: !!budget.pots?.length,
      label: "Set up pots",
    },
    {
      id: "expense" as const,
      title: "Record money as it moves",
      description:
        "Add income when received. For an expense, choose its purpose and the account you paid from.",
      done: budget.transactions.some(
        (t) =>
          !t.voidedAt && ["income", "expense", "saving-spent"].includes(t.type),
      ),
      label: "Record an expense",
    },
  ];
  return (
    <details className="panel money-help" open={!budget.accounts.length}>
      <summary>Getting started & understanding your balances</summary>
      <div className="setup-steps">
        {steps.map((step, index) => (
          <div className="setup-step" key={step.id}>
            <span
              className={`step-number ${step.done ? "done" : ""}`}
              aria-label={step.done ? "Complete" : `Step ${index + 1}`}
            >
              {step.done ? <Icon name="check" size={16} /> : index + 1}
            </span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <button className="text-button" onClick={() => go(step.id)}>
                {step.label}
                <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="balance-explainer">
        <h3>Where every bit belongs</h3>
        <dl>
          <div>
            <dt>Total in accounts</dt>
            <dd>{fmt(balances.total)}</dd>
          </div>
          <div>
            <dt>Protected savings</dt>
            <dd>{fmt(balances.savings)}</dd>
          </div>
          <div>
            <dt>Reserved in pots</dt>
            <dd>{fmt(balances.pots)}</dd>
          </div>
          <div>
            <dt>Free to assign or spend</dt>
            <dd>{fmt(balances.free)}</dd>
          </div>
        </dl>
        <p>
          Savings + pots + free money = your total. Spendable money includes
          pots and free money. Moving money between accounts does not count as
          income or spending.
        </p>
      </div>
      <div className="guide-faq">
        <h3>When plans change</h3>
        <p>
          Move money between pots to change its purpose. Move savings between
          accounts to change where it is held. Open an expense in Activity to
          record a refund, correct a mistake, or undo a duplicate.
        </p>
        <p>
          Budgetly records what you enter. It does not send bank payments. Bills
          change your balance only when you mark them paid.
        </p>
      </div>
    </details>
  );
}

export function DueSoon({
  budget,
  today,
  fmt,
  pay,
}: {
  budget: Budget;
  today: string;
  fmt: (amount: number) => string;
  pay: (kind: "bill" | "debt", id: string) => void;
}) {
  const { items, outgoing, incoming } = upcomingPayments(budget, today);
  if (!items.length) return null;
  return (
    <section className="panel due-soon">
      <div className="section-heading">
        <div>
          <h2>Due soon & overdue</h2>
          <p>Next payments due in the next 7 days, including overdue items.</p>
        </div>
      </div>
      <p className="due-totals">
        {fmt(outgoing)} to pay
        {incoming > 0 && ` · ${fmt(incoming)} expected back`}
      </p>
      <div>
        {items.map((item) => (
          <div className="recurring-row" key={`${item.kind}-${item.id}`}>
            <span className={`tile ${item.incoming ? "mint" : "peach"}`}>
              <Icon name={item.kind === "bill" ? "repeat" : "people"} />
            </span>
            <div className="row-copy">
              <strong>{item.title}</strong>
              <span className={item.due < today ? "peach-text" : ""}>
                {item.due < today
                  ? "Overdue · "
                  : item.due === today
                    ? "Today · "
                    : "Due · "}
                {new Date(`${item.due}T12:00:00`).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="right">
              <strong>{fmt(item.amount)}</strong>
              <button
                className="text-button"
                onClick={() => pay(item.kind, item.id)}
              >
                {item.incoming ? "Record received" : "Record payment"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="form-hint">
        These reminders do not deduct money. Record only payments that have
        actually happened. Expected repayments are not included in your balance
        yet.
      </p>
    </section>
  );
}
