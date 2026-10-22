"use client";
import { useState } from "react";
import { monthlySummary } from "@/lib/reports";
import type { Budget } from "@/lib/types";
import { Icon } from "./icons";

export function SpendingPlan({
  budget,
  currentMonth,
  fmt,
  edit,
}: {
  budget: Budget;
  currentMonth: string;
  fmt: (n: number) => string;
  edit: (month: string, category: string) => void;
}) {
  const [month, setMonth] = useState(currentMonth);
  const summary = monthlySummary(budget, month);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Your monthly plan</h2>
          <p>Set an overall limit, category limits, or both.</p>
        </div>
        <input
          aria-label="Budget month"
          className="budget-month"
          type="month"
          min="1000-01"
          max="9998-12"
          required
          value={month}
          onChange={(e) => {
            if (e.target.value) setMonth(e.target.value);
          }}
        />
      </div>
      <div className="summary-grid two">
        <div className="panel summary">
          <span className="tile mint">
            <Icon name="down" />
          </span>
          <span>Income this month</span>
          <strong>{fmt(summary.income)}</strong>
        </div>
        <div className="panel summary">
          <span className="tile peach">
            <Icon name="up" />
          </span>
          <span>Spent this month</span>
          <strong>{fmt(summary.spent)}</strong>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Spending limits</h2>
            <p>Limits help you plan. They don’t block real transactions.</p>
          </div>
          <button
            className="text-button"
            onClick={() => edit(month, "All spending")}
          >
            <Icon name="plus" size={16} />
            Set a limit
          </button>
        </div>
        {summary.limits.length ? (
          <div className="budget-limits">
            {summary.limits.map((limit) => (
              <button
                className={`budget-limit ${limit.remaining < 0 ? "peach" : "mint"}`}
                key={limit.id}
                onClick={() => edit(month, limit.category)}
              >
                <div className="row-between">
                  <strong>{limit.category}</strong>
                  <span>
                    {fmt(limit.used)} / {fmt(limit.amount)}
                  </span>
                </div>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label={`${limit.category} used`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(
                    100,
                    Math.round((limit.used / limit.amount) * 100),
                  )}
                >
                  <span
                    style={{
                      width: `${Math.min(100, (limit.used / limit.amount) * 100)}%`,
                    }}
                  />
                </div>
                <div className="row-between">
                  <small>
                    {limit.remaining < 0
                      ? `${fmt(-limit.remaining)} over budget`
                      : `${fmt(limit.remaining)} left`}
                  </small>
                  <small>Edit limit</small>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">
            <span className="empty-icon">
              <Icon name="wallet" size={27} />
            </span>
            <h3>A plan for your everyday</h3>
            <p>
              Choose how much you want to spend this month. Your transactions
              automatically update the progress.
            </p>
            <button
              className="button secondary small"
              onClick={() => edit(month, "All spending")}
            >
              Set your first limit
            </button>
          </div>
        )}
      </section>
      <section className="panel category-panel">
        <div className="section-heading">
          <div>
            <h2>Where your money went</h2>
            <p>
              Actual spending by category, including money spent from savings.
            </p>
          </div>
        </div>
        {summary.byCategory.length ? (
          summary.byCategory.map(([category, amount]) => (
            <div className="category-row" key={category}>
              <span>{category}</span>
              <div className="progress">
                <span
                  style={{
                    width: `${(amount / Math.max(summary.spent, 1)) * 100}%`,
                  }}
                />
              </div>
              <strong>{fmt(amount)}</strong>
              <button
                className="text-button"
                aria-label={`Set ${category} budget`}
                onClick={() => edit(month, category)}
              >
                <Icon name="plus" size={17} />
              </button>
            </div>
          ))
        ) : (
          <p className="form-hint">No expenses recorded for this month.</p>
        )}
      </section>
      <div className="hint">
        <Icon name="calendar" size={17} />
        <p>
          Each month has its own limits. Transfers, loans, opening balances, and
          money merely set aside for goals don’t count as spending. Overall and
          category limits overlap; they are not added together.
        </p>
      </div>
    </>
  );
}
