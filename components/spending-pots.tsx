"use client";
import { balanceSummary, type Budget, type SpendingPot } from "@/lib/types";
import { Icon } from "./icons";

export function SpendingPots({
  budget,
  fmt,
  create,
  manage,
  edit,
  spend,
  history,
}: {
  budget: Budget;
  fmt: (amount: number) => string;
  create: () => void;
  manage: (pot: SpendingPot) => void;
  edit: (pot: SpendingPot) => void;
  spend: (pot: SpendingPot) => void;
  history: (pot: SpendingPot) => void;
}) {
  const balances = balanceSummary(budget);
  return (
    <>
      <div className="money-guide">
        <div>
          <b>1. Add your accounts</b>
          <p>Where your money is: bank, wallet, or cash.</p>
        </div>
        <div>
          <b>2. Give money a purpose</b>
          <p>
            Reserve some for food, bills, or a task. Keep savings protected.
          </p>
        </div>
        <div>
          <b>3. Record what you spend</b>
          <p>
            Choose a pot and the account you paid from. Both update together.
          </p>
        </div>
      </div>
      <div className="summary-grid two">
        <div className="panel pot-summary">
          <span>Free to assign or spend</span>
          <strong>{fmt(balances.free)}</strong>
          <small>After savings and spending pots</small>
        </div>
        <div className="panel pot-summary">
          <span>Reserved in spending pots</span>
          <strong>{fmt(balances.pots)}</strong>
          <small>Still part of your account balances</small>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>Your spending pots</h2>
          <p>
            Money stays reserved until you spend or release it. No monthly
            reset.
          </p>
        </div>
        <button className="button primary small" onClick={create}>
          <Icon name="plus" size={16} />
          New pot
        </button>
      </div>
      {budget.pots?.length ? (
        <div className="goal-grid">
          {budget.pots.map((pot) => (
            <article className="goal-card blue" key={pot.id}>
              <div className="row-between">
                <span className="tile">
                  <Icon name="wallet" />
                </span>
                <button
                  className="icon-button"
                  aria-label={`Edit ${pot.name}`}
                  onClick={() => edit(pot)}
                >
                  <Icon name="edit" size={17} />
                </button>
              </div>
              <h3>{pot.name}</h3>
              <p className="subtle">{pot.category}</p>
              <div className="goal-amount">
                <strong>{fmt(pot.balance)}</strong>
                <span>left to spend</span>
              </div>
              <div className="pot-actions">
                <button
                  className="button primary small"
                  disabled={!pot.balance}
                  onClick={() => spend(pot)}
                >
                  Spend from pot
                </button>
                <button
                  className="button secondary small"
                  onClick={() => manage(pot)}
                >
                  Add / release
                </button>
              </div>
              <button
                className="text-button pot-history"
                onClick={() => history(pot)}
              >
                View pot activity
                <Icon name="arrow" size={14} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel empty">
          <span className="empty-icon">
            <Icon name="wallet" />
          </span>
          <h3>Set aside money for your next expense</h3>
          <p>
            For example, reserve 10,000 for food. A 1,000 food expense leaves
            9,000 in the pot and reduces the account you paid from by 1,000.
          </p>
          <button className="button secondary small" onClick={create}>
            Create your first pot
          </button>
        </div>
      )}
      <div className="hint">
        <Icon name="wallet" size={17} />
        <p>
          Pots describe what money is for. Accounts show where it is held. You
          can pay from any account with enough money outside savings.
        </p>
      </div>
    </>
  );
}
