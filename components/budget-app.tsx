"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  available,
  balanceSummary,
  type SpendingPot,
  categories,
  colors,
  currencies,
  isSpending,
  spendingAmount,
  refundableAmount,
  type SpendingLimit,
  goalBalance,
  reserved,
  type Account,
  type Budget,
  type Debt,
  type Goal,
  type Recurring,
  type Transaction,
} from "@/lib/types";
import { Brand, Icon, type IconName } from "./icons";
import { MoneyGuide, DueSoon } from "./money-help";
import { SpendingPots } from "./spending-pots";
import { SpendingPlan } from "./spending-plan";
import { TransactionDetails } from "./transaction-details";
import { monthlySummary, transactionsCsv } from "@/lib/reports";
import { requestId, downloadFile } from "@/lib/client";

type Tab =
  | "overview"
  | "transactions"
  | "accounts"
  | "savings"
  | "recurring"
  | "debts"
  | "settings"
  | "more"
  | "budgets";
type Modal = {
  type: string;
  item?:
    | Account
    | Goal
    | Debt
    | Recurring
    | Transaction
    | SpendingLimit
    | SpendingPot;
  potId?: string;
  month?: string;
  preset?: string;
};
const navigation: { id: Tab; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "transactions", label: "Transactions", icon: "arrows" },
  { id: "accounts", label: "Accounts", icon: "wallet" },
  { id: "savings", label: "Savings", icon: "leaf" },
  { id: "recurring", label: "Recurring expenses", icon: "repeat" },
  { id: "debts", label: "Debts & dues", icon: "people" },
  { id: "budgets", label: "Spending pots", icon: "wallet" },
];
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}
function amountInput(amount: number) {
  return (amount / 100).toFixed(2);
}
function money(amount: number, currency = "PKR") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: amount % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
const accountIcon = (kind: string): IconName =>
  kind === "bank" ? "bank" : kind === "cash" ? "cash" : "wallet";
const spending = isSpending;
const transactionIcon = (t: Transaction): IconName =>
  t.type === "transfer"
    ? "arrows"
    : t.type.includes("saving") || t.type === "release"
      ? "leaf"
      : t.type.startsWith("debt")
        ? "people"
        : t.type === "income"
          ? "down"
          : t.category === "Food & drinks"
            ? "food"
            : t.type === "adjustment"
              ? "wallet"
              : "up";
function Empty({
  icon,
  title,
  description,
  action,
  label,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={27} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button secondary small" onClick={action}>
          <Icon name="plus" size={16} />
          {label}
        </button>
      )}
    </div>
  );
}
function SectionTitle({
  title,
  detail,
  action,
  actionLabel = "View all",
}: {
  title: string;
  detail?: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action && (
        <button className="text-button" onClick={action}>
          {actionLabel}
          <Icon name="arrow" size={16} />
        </button>
      )}
    </div>
  );
}

export default function BudgetApp() {
  const [auth, setAuth] = useState<"loading" | "out" | "in">("loading");
  const [username, setUsername] = useState("");
  const [budget, setBudget] = useState<Budget | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<Modal | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [potFilter, setPotFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const mounted = useRef(true);
  const loadSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/budget", { cache: "no-store" });
      const data = await res.json();
      if (!mounted.current || sequence !== loadSequence.current) return;
      if (res.status === 401) {
        setAuth("out");
        setModal(null);
        setBudget(null);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      if (mounted.current)
        setBudget((previous) =>
          previous && previous.revision > data.budget.revision
            ? previous
            : data.budget,
        );
    } catch (e) {
      if (mounted.current && sequence === loadSequence.current)
        setError(
          e instanceof Error
            ? e.message
            : "Unable to connect. Please try again.",
        );
    } finally {
      if (mounted.current && sequence === loadSequence.current)
        setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    fetch("/api/auth", { cache: "no-store", signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (controller.signal.aborted || !mounted.current) return;
        setAuth(data.authenticated ? "in" : "out");
        setUsername(data.username || "");
        if (data.authenticated) void refresh();
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAuth("out");
        setError("Unable to connect to the server. Please try again.");
      });
    return () => {
      controller.abort();
      mounted.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (auth === "in") {
      const focus = () => {
        void refresh();
      };
      window.addEventListener("focus", focus);
      window.addEventListener("online", focus);
      const timer = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 60000);
      return () => {
        window.removeEventListener("focus", focus);
        window.removeEventListener("online", focus);
        clearInterval(timer);
      };
    }
  }, [auth, refresh]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function navigate(value: Tab) {
    setTab(value);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function logout() {
    try {
      const res = await fetch("/api/auth", { method: "DELETE" });
      if (!res.ok) throw new Error();
      loadSequence.current++;
      setBudget(null);
      setAuth("out");
      setModal(null);
      setError("");
      setTab("overview");
    } catch {
      setError("Could not sign out. Please try again.");
    }
  }
  if (auth === "loading")
    return (
      <main className="loading-page">
        <Brand />
        <span className="loader" />
        <p>Making room for a little clarity…</p>
      </main>
    );
  if (auth === "out")
    return (
      <Login
        onSuccess={(name) => {
          setUsername(name);
          setAuth("in");
          setError("");
          void refresh();
        }}
        initialError={error}
      />
    );
  const total = budget?.accounts.reduce((sum, a) => sum + a.balance, 0) ?? 0;
  const saved = budget?.goals.reduce((sum, g) => sum + goalBalance(g), 0) ?? 0;
  const potTotal = budget ? balanceSummary(budget).pots : 0;
  const currency = budget?.currency || "PKR";
  const fmt = (n: number) => money(n, currency);
  const currentMonth = today().slice(0, 7);
  const monthSummary = budget
    ? monthlySummary(budget, currentMonth)
    : { income: 0, spent: 0, limits: [] };
  const { income, spent } = monthSummary;
  const upcoming = [...(budget?.recurring || [])].sort((a, b) =>
    a.due.localeCompare(b.due),
  );
  const transactions = [...(budget?.transactions || [])].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  const openTransaction = (preset = "expense") =>
    setModal(
      budget?.accounts.length
        ? { type: "transaction", preset }
        : { type: "account" },
    );
  const filtered = transactions.filter(
    (t) =>
      (!query ||
        `${t.title} ${t.category} ${t.note}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!accountFilter ||
        t.accountId === accountFilter ||
        t.toAccountId === accountFilter) &&
      (!potFilter || t.potId === potFilter || t.toPotId === potFilter) &&
      (!month || t.date.startsWith(month)) &&
      (!day || t.date === day) &&
      (filter === "voided"
        ? !!t.voidedAt
        : !t.voidedAt &&
          (filter === "all" ||
            (filter === "expense" ? spending(t) : t.type === filter))),
  );
  function exportData() {
    if (!budget) return;
    const { requestIds, ...data } = budget;
    void requestIds;
    downloadFile(
      JSON.stringify(data, null, 2),
      "application/json",
      `budgetly-${today()}.json`,
    );
    setToast("Your data has been exported.");
  }
  function accountCard(a: Account) {
    return (
      <button
        key={a.id}
        className={`account-card ${a.color}`}
        onClick={() => setModal({ type: "account", item: a })}
      >
        <div className="row-between">
          <span className="account-symbol">
            <Icon name={accountIcon(a.kind)} />
          </span>
          <span className="account-kind">
            {a.kind}
            <Icon name="arrow" size={15} />
          </span>
        </div>
        <span className="account-name">{a.name}</span>
        <strong>{fmt(a.balance)}</strong>
        <span className="account-foot">
          {reserved(budget!, a.id)
            ? `${fmt(available(budget!, a.id))} outside savings`
            : "Current account balance"}
        </span>
      </button>
    );
  }
  function goalCard(g: Goal) {
    const balance = goalBalance(g);
    const percent = g.target
      ? Math.min(100, Math.round((balance / g.target) * 100))
      : 0;
    return (
      <article className={`goal-card ${g.color}`} key={g.id}>
        <div className="row-between">
          <span className="tile">
            <Icon name="leaf" />
          </span>
          <button
            className="icon-button"
            aria-label={`Edit ${g.name}`}
            onClick={() => setModal({ type: "goal", item: g })}
          >
            <Icon name="edit" size={17} />
          </button>
        </div>
        <h3>{g.name}</h3>
        <div className="goal-amount">
          <strong>{fmt(balance)}</strong>
          <span>
            {g.target ? `of ${fmt(g.target)}` : "saved and protected"}
          </span>
        </div>
        {g.target > 0 && (
          <div
            className="progress"
            role="progressbar"
            aria-label={g.name}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        )}
        <div className="row-between goal-caption">
          <span>
            {g.target
              ? percent === 100
                ? "Target reached"
                : "No monthly deadline"
              : "Included in total, excluded from spending"}
          </span>
          {g.target > 0 && <b>{percent}%</b>}
        </div>
        <button
          className="button secondary full small"
          onClick={() => setModal({ type: "goal-move", item: g })}
        >
          <Icon name="plus" size={15} />
          Manage savings
        </button>
        {balance > 0 && budget!.accounts.length > 1 && (
          <button
            className="text-button savings-transfer"
            onClick={() => setModal({ type: "goal-transfer", item: g })}
          >
            Move savings to another account
            <Icon name="arrows" size={15} />
          </button>
        )}
        <div className="savings-locations">
          {g.allocations
            .filter((a) => a.amount > 0)
            .map((a) => (
              <span key={a.accountId}>
                {
                  budget!.accounts.find((account) => account.id === a.accountId)
                    ?.name
                }
                : {fmt(a.amount)}
              </span>
            ))}
        </div>
      </article>
    );
  }
  function recurringRow(r: Recurring) {
    const due =
      r.due < today()
        ? "Overdue"
        : r.due === today()
          ? "Due today"
          : `Due ${formatDate(r.due)}`;
    return (
      <div className="recurring-row" key={r.id}>
        <span className="tile purple">
          <Icon name="repeat" />
        </span>
        <button
          className="row-copy plain"
          onClick={() => setModal({ type: "recurring", item: r })}
        >
          <strong>{r.name}</strong>
          <span>
            {r.frequency} ·{" "}
            <span className={r.due <= today() ? "peach-text" : ""}>{due}</span>
          </span>
        </button>
        <div className="right">
          <strong>{fmt(r.amount)}</strong>
          <button
            className="text-button mint-text"
            onClick={() => setModal({ type: "pay-recurring", item: r })}
          >
            Mark paid
            <Icon name="check" size={13} />
          </button>
        </div>
      </div>
    );
  }
  function transactionRow(t: Transaction) {
    const positive =
      ["income", "debt-in", "release", "refund"].includes(t.type) ||
      (t.type === "adjustment" && t.amount >= 0);
    const neutral = [
      "transfer",
      "saving",
      "release",
      "reserve",
      "reserve-release",
      "reserve-transfer",
      "saving-transfer",
    ].includes(t.type);
    return (
      <button
        type="button"
        className={`transaction-row transaction-button ${t.voidedAt ? "voided" : ""}`}
        key={t.id}
        onClick={() => setModal({ type: "details", item: t })}
      >
        <span
          className={`tile ${neutral ? "purple" : positive ? "mint" : "peach"}`}
        >
          <Icon name={transactionIcon(t)} />
        </span>
        <span className="row-copy">
          <strong>{t.title}</strong>
          <span>
            {budget?.accounts.find((a) => a.id === t.accountId)?.name ||
              (t.type.startsWith("reserve") ? "Money allocation" : "Account")}
            {t.toAccountId
              ? ` → ${budget?.accounts.find((a) => a.id === t.toAccountId)?.name}`
              : ` · ${t.category}`}
          </span>
          {t.note && <span className="transaction-note">{t.note}</span>}
        </span>
        <span className="right">
          <strong className={neutral ? "" : positive ? "mint-text" : ""}>
            {neutral ? "" : positive ? "+" : "−"}
            {fmt(Math.abs(t.amount))}
          </strong>
          <span>
            {formatDate(t.date)}
            {t.voidedAt ? " · voided" : ""}
            {t.type === "adjustment"
              ? " · correction"
              : t.type === "saving"
                ? " · reserved"
                : t.type === "release"
                  ? " · released"
                  : ""}
          </span>
        </span>
      </button>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <span className="nav-label">YOUR MONEY, IN VIEW</span>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(n.id)}
              className={tab === n.id ? "active" : ""}
            >
              <Icon name={n.icon} />
              {n.label}
              {tab === n.id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="leaf" size={24} />
            <p>
              Small steps.
              <br />
              <strong>Better money days.</strong>
            </p>
          </div>
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Icon name="settings" />
            Settings
          </button>
          <button onClick={logout}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="breadcrumb">
            My workspace<span>/</span>
            <strong>
              {navigation.find((n) => n.id === tab)?.label ||
                (tab === "settings" ? "Settings" : "More")}
            </strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Refresh budget"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <Icon name="repeat" size={18} />
            </button>
            <span className="private-badge">
              <span />
              Personal space
            </span>
            <button
              className="avatar"
              onClick={() => navigate("settings")}
              aria-label="Open settings"
            >
              {username.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <main className="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tab === "overview"
                  ? new Date().toLocaleDateString("en", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  : "A LITTLE CLARITY, EVERY DAY"}
              </div>
              <h1>
                {tab === "overview" ? (
                  <>
                    Hey, {username}
                    <span className="greeting-dot">.</span>
                  </>
                ) : (
                  navigation.find((n) => n.id === tab)?.label ||
                  (tab === "settings"
                    ? "Make yourself at home."
                    : "The rest of your money life.")
                )}
              </h1>
              <p>
                {
                  {
                    overview:
                      "See what you have, what’s reserved, and what you can spend.",
                    accounts: "Every account. One clear picture.",
                    transactions:
                      "The little things add up. Keep them in view.",
                    savings:
                      "Money you already have, protected from everyday spending.",
                    recurring: "Your regular expenses, without the surprises.",
                    budgets:
                      "Reserve money for tasks, then spend from it as you go.",
                    debts: "Keep track of what’s owed, both ways.",
                    settings: "A few things to make Budgetly yours.",
                    more: "Spending pots, bills, debts, and your preferences.",
                  }[tab]
                }
              </p>
            </div>
            {budget && (
              <button
                className="button primary heading-add"
                aria-label="Add transaction"
                onClick={() => openTransaction()}
              >
                <Icon name="plus" size={18} />
                <span>Add transaction</span>
              </button>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="text-button"
                onClick={() => void refresh()}
                disabled={loading}
              >
                {loading ? "Connecting…" : "Try again"}
              </button>
            </div>
          )}
          {!budget ? (
            <div className="panel loading-panel">
              {loading ? (
                <>
                  <span className="loader" />
                  <p>Opening your money workspace…</p>
                </>
              ) : (
                <Empty
                  icon="wallet"
                  title="Let’s connect your budget"
                  description="Once your MongoDB connection is ready, your accounts and activity will appear here."
                  action={() => void refresh()}
                  label="Reconnect"
                />
              )}
            </div>
          ) : (
            <>
              {tab === "overview" && (
                <>
                  <div className="quick-actions" aria-label="Quick actions">
                    <button
                      className="button primary small"
                      onClick={() => openTransaction("expense")}
                    >
                      <Icon name="up" size={16} />
                      Add expense
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() => openTransaction("income")}
                    >
                      <Icon name="down" size={16} />
                      Add income
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() =>
                        setModal({
                          type: budget.accounts.length ? "pot" : "account",
                        })
                      }
                    >
                      <Icon name="wallet" size={16} />
                      Reserve money
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() =>
                        budget.accounts.length > 1
                          ? openTransaction("transfer")
                          : setModal({ type: "account" })
                      }
                    >
                      <Icon name="arrows" size={16} />
                      Transfer money
                    </button>
                  </div>
                  <MoneyGuide
                    budget={budget}
                    fmt={fmt}
                    go={(step) =>
                      step === "expense" ? openTransaction() : navigate(step)
                    }
                  />
                  <div className="overview-top">
                    <section className="balance-card">
                      <div className="row-between">
                        <span className="balance-label">
                          <span className="status-dot" />
                          Spendable balance
                        </span>
                        <span className="currency-chip">{currency}</span>
                      </div>
                      <div className="balance-number">{fmt(total - saved)}</div>
                      <p>
                        Includes {fmt(potTotal)} reserved in spending pots.
                        Savings are excluded.
                      </p>
                      <div className="balance-divider" />
                      <div className="balance-stats">
                        <div>
                          <span>Total balance</span>
                          <strong>{fmt(total)}</strong>
                        </div>
                        <div>
                          <span>
                            <Icon name="leaf" size={14} />
                            Savings
                          </span>
                          <strong>{fmt(saved)}</strong>
                        </div>
                        <button
                          aria-label="View accounts"
                          onClick={() => navigate("accounts")}
                        >
                          <Icon name="arrow" />
                        </button>
                      </div>
                      <div className="balance-art" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                    </section>
                    <section className="panel month-card">
                      <div className="row-between">
                        <h2>This month</h2>
                        <span className="subtle">
                          {new Date().toLocaleDateString("en", {
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="month-stat">
                        <span className="tile mint">
                          <Icon name="down" size={18} />
                        </span>
                        <div>
                          <span>Money in</span>
                          <strong>{fmt(income)}</strong>
                        </div>
                        <span className="mini-label">Income</span>
                      </div>
                      <div className="month-stat">
                        <span className="tile peach">
                          <Icon name="up" size={18} />
                        </span>
                        <div>
                          <span>Net spending</span>
                          <strong>{fmt(spent)}</strong>
                        </div>
                        <span className="mini-label">After refunds</span>
                      </div>
                      <div className="month-bottom">
                        {spent > income
                          ? "Spending is ahead of income this month."
                          : income
                            ? "A little more coming in than going out."
                            : "A fresh month. Make every little bit count."}
                      </div>
                    </section>
                  </div>
                  <button
                    className="budget-overview"
                    onClick={() => navigate("budgets")}
                  >
                    <span className="tile mint">
                      <Icon name="wallet" />
                    </span>
                    <span>
                      <strong>
                        {fmt(total - saved - potTotal)} free to assign or spend
                      </strong>
                      <small>
                        {fmt(potTotal)} reserved for tasks · Open spending pots
                      </small>
                    </span>
                    <Icon name="arrow" size={18} />
                  </button>
                  <DueSoon
                    budget={budget}
                    today={today()}
                    fmt={fmt}
                    pay={(kind, id) => {
                      if (!budget.accounts.length) {
                        setModal({ type: "account" });
                        return;
                      }
                      setModal(
                        kind === "bill"
                          ? {
                              type: "pay-recurring",
                              item: budget.recurring.find((r) => r.id === id),
                            }
                          : {
                              type: "debt-pay",
                              item: budget.debts.find((d) => d.id === id),
                            },
                      );
                    }}
                  />
                  {!budget.accounts.length && (
                    <div className="onboarding">
                      <span className="tile mint">
                        <Icon name="wallet" />
                      </span>
                      <div>
                        <h3>Your first step to a clearer picture</h3>
                        <p>
                          Add your bank, wallet, or cash and its current
                          balance.
                        </p>
                      </div>
                      <button
                        className="button primary small"
                        onClick={() => setModal({ type: "account" })}
                      >
                        <Icon name="plus" size={16} />
                        Add an account
                      </button>
                    </div>
                  )}
                  <section className="section">
                    <SectionTitle
                      title="Your accounts"
                      detail="A home for every bit of your money."
                      action={() => navigate("accounts")}
                    />
                    <div className="accounts-strip">
                      {budget.accounts.slice(0, 3).map(accountCard)}
                      <button
                        className="add-account-card"
                        onClick={() => setModal({ type: "account" })}
                      >
                        <span>
                          <Icon name="plus" />
                        </span>
                        Add account<small>Bank, wallet, or cash</small>
                      </button>
                    </div>
                  </section>
                  <div className="dashboard-columns">
                    <section className="panel">
                      <SectionTitle
                        title="Recent activity"
                        action={() => navigate("transactions")}
                      />
                      {transactions.some((t) => !t.voidedAt) ? (
                        transactions
                          .filter((t) => !t.voidedAt)
                          .slice(0, 5)
                          .map(transactionRow)
                      ) : (
                        <Empty
                          icon="arrows"
                          title="Your story starts here"
                          description="Add your first transaction. Every little detail brings the bigger picture into focus."
                          action={() => openTransaction()}
                          label="Add transaction"
                        />
                      )}
                    </section>
                    <section className="panel spending-card">
                      <SectionTitle
                        title="Net spending this week"
                        detail="Expenses minus refunds on the day recorded."
                      />
                      <SpendingChart transactions={transactions} fmt={fmt} />
                    </section>
                  </div>
                  <div className="dashboard-columns">
                    <section className="panel">
                      <SectionTitle
                        title="Coming up"
                        action={() => navigate("recurring")}
                      />
                      {upcoming.length ? (
                        upcoming.slice(0, 3).map(recurringRow)
                      ) : (
                        <Empty
                          icon="repeat"
                          title="No surprises on the horizon"
                          description="Keep subscriptions and weekly or monthly bills in one place."
                          action={() =>
                            setModal({
                              type: budget.accounts.length
                                ? "recurring"
                                : "account",
                            })
                          }
                          label="Add recurring expense"
                        />
                      )}
                    </section>
                    <section className="panel">
                      <SectionTitle
                        title="Protected savings"
                        action={() => navigate("savings")}
                      />
                      {budget.goals.length ? (
                        <div className="mini-goals">
                          {budget.goals.slice(0, 3).map((g) => (
                            <button
                              className={`mini-goal ${g.color}`}
                              key={g.id}
                              onClick={() =>
                                setModal({ type: "goal-move", item: g })
                              }
                            >
                              <div className="row-between">
                                <strong>
                                  <Icon name="leaf" size={16} />
                                  {g.name}
                                </strong>
                                <span>{fmt(goalBalance(g))}</span>
                              </div>
                              <div className="progress">
                                <span
                                  style={{
                                    width: `${g.target ? Math.min(100, (goalBalance(g) / g.target) * 100) : 0}%`,
                                  }}
                                />
                              </div>
                              <small>
                                {g.target
                                  ? `of ${fmt(g.target)}`
                                  : "Protected savings"}
                              </small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon="leaf"
                          title="Keep your savings separate"
                          description="Record money you already keep aside. Your total includes it; everyday spending does not."
                          action={() => setModal({ type: "goal" })}
                          label="Add savings"
                        />
                      )}
                    </section>
                  </div>
                </>
              )}
              {tab === "budgets" && (
                <>
                  <SpendingPots
                    history={(pot) => {
                      setPotFilter(pot.id);
                      setAccountFilter("");
                      setQuery("");
                      setMonth("");
                      setDay("");
                      setFilter("all");
                      navigate("transactions");
                    }}
                    budget={budget}
                    fmt={fmt}
                    create={() => setModal({ type: "pot" })}
                    edit={(pot) => setModal({ type: "pot", item: pot })}
                    manage={(pot) => setModal({ type: "pot-move", item: pot })}
                    spend={(pot) =>
                      setModal({ type: "transaction", potId: pot.id })
                    }
                  />
                  <details className="panel optional-limits">
                    <summary>
                      Optional monthly spending limits & reports
                    </summary>
                    <SpendingPlan
                      budget={budget}
                      currentMonth={currentMonth}
                      fmt={fmt}
                      edit={(month, category) =>
                        setModal({
                          type: "limit",
                          month,
                          preset: category,
                          item: budget.spendingLimits?.find(
                            (l) => l.month === month && l.category === category,
                          ),
                        })
                      }
                    />
                  </details>
                </>
              )}
              {tab === "accounts" && (
                <>
                  <div className="summary-grid">
                    <Summary
                      icon="wallet"
                      label="Total balance"
                      value={fmt(total)}
                    />
                    <Summary
                      icon="leaf"
                      label="Protected savings"
                      value={fmt(saved)}
                      color="purple"
                    />
                    <Summary
                      icon="check"
                      label="Spendable (includes pots)"
                      value={fmt(total - saved)}
                      color="blue"
                    />
                  </div>
                  <SectionTitle
                    title="All your accounts"
                    action={() => setModal({ type: "account" })}
                    actionLabel="Add account"
                  />
                  <div className="account-grid">
                    {budget.accounts.map(accountCard)}
                    <button
                      className="add-account-card"
                      onClick={() => setModal({ type: "account" })}
                    >
                      <span>
                        <Icon name="plus" />
                      </span>
                      Add an account<small>Give every balance a home</small>
                    </button>
                  </div>
                  <div className="hint">
                    <Icon name="lock" size={17} />
                    <p>
                      Tap an account to edit it or correct its balance.
                      Transfers move available money between accounts without
                      changing your total or spending pots. Pots track a purpose
                      across accounts.
                    </p>
                  </div>
                  {budget.accounts.length > 1 && (
                    <button
                      className="button secondary"
                      onClick={() => openTransaction("transfer")}
                    >
                      <Icon name="arrows" />
                      Transfer between accounts
                    </button>
                  )}
                </>
              )}
              {tab === "transactions" && (
                <>
                  <div className="activity-controls">
                    <label className="search-field">
                      <Icon name="search" />
                      <input
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setVisibleCount(30);
                        }}
                        placeholder="Search your transactions"
                        aria-label="Search transactions"
                      />
                    </label>
                    <select
                      aria-label="Filter by account"
                      value={accountFilter}
                      onChange={(e) => {
                        setAccountFilter(e.target.value);
                        setVisibleCount(30);
                      }}
                    >
                      <option value="">All accounts</option>
                      {budget.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter by spending pot"
                      value={potFilter}
                      onChange={(e) => {
                        setPotFilter(e.target.value);
                        setVisibleCount(30);
                      }}
                    >
                      <option value="">All spending pots</option>
                      {budget.pots?.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="month"
                      aria-label="Filter by month"
                      value={month}
                      onChange={(e) => {
                        setMonth(e.target.value);
                        setDay("");
                        setVisibleCount(30);
                      }}
                    />
                  </div>
                  <div className="activity-shortcuts">
                    <button
                      className="text-button"
                      onClick={() => {
                        setDay(today());
                        setMonth("");
                        setVisibleCount(30);
                      }}
                    >
                      Today
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        setMonth(currentMonth);
                        setDay("");
                        setVisibleCount(30);
                      }}
                    >
                      This month
                    </button>
                    <input
                      type="date"
                      aria-label="Filter by day"
                      value={day}
                      onChange={(e) => {
                        setDay(e.target.value);
                        setMonth("");
                        setVisibleCount(30);
                      }}
                    />
                    <button
                      className="text-button"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                        setAccountFilter("");
                        setPotFilter("");
                        setMonth("");
                        setDay("");
                        setVisibleCount(30);
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                  <div className="filter-tabs">
                    {[
                      "all",
                      "expense",
                      "income",
                      "transfer",
                      "saving",
                      "refund",
                      "voided",
                    ].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "selected" : ""}
                        onClick={() => {
                          setFilter(f);
                          setVisibleCount(30);
                        }}
                      >
                        {f === "all"
                          ? "All activity"
                          : f === "voided"
                            ? "Voided"
                            : f === "saving"
                              ? "Savings added"
                              : `${f.charAt(0).toUpperCase()}${f.slice(1)}s`}
                      </button>
                    ))}
                  </div>
                  <section className="panel">
                    <SectionTitle
                      title="Your money trail"
                      action={() =>
                        downloadFile(
                          transactionsCsv(filtered, budget),
                          "text/csv;charset=utf-8",
                          `budgetly-transactions-${today()}.csv`,
                        )
                      }
                      actionLabel="Export CSV"
                      detail={`${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`}
                    />
                    {filtered.length ? (
                      filtered.slice(0, visibleCount).map(transactionRow)
                    ) : (
                      <Empty
                        icon="search"
                        title={
                          transactions.length
                            ? "Nothing matches just yet"
                            : "A fresh start"
                        }
                        description={
                          transactions.length
                            ? "Try another search, account, or month."
                            : "Record money in, money out, and transfers to see your history here."
                        }
                      />
                    )}
                    {filtered.length > visibleCount && (
                      <button
                        className="button secondary full"
                        onClick={() => setVisibleCount((n) => n + 30)}
                      >
                        Show more
                      </button>
                    )}
                  </section>
                </>
              )}
              {tab === "savings" && (
                <>
                  <div className="savings-banner">
                    <span className="tile mint">
                      <Icon name="leaf" size={28} />
                    </span>
                    <div>
                      <span>Total set aside</span>
                      <strong>{fmt(saved)}</strong>
                    </div>
                    <p>
                      Included in your total balance.
                      <br />
                      Protected from everyday spending.
                    </p>
                  </div>
                  <SectionTitle
                    title="Your savings"
                    action={() => setModal({ type: "goal" })}
                    actionLabel="Add savings"
                  />
                  {budget.goals.length ? (
                    <div className="goal-grid">
                      {budget.goals.map(goalCard)}
                    </div>
                  ) : (
                    <section className="panel">
                      <Empty
                        icon="leaf"
                        title="Already have money saved?"
                        description="Add the amount you already keep as savings. It stays in your total balance and is excluded from everyday spending. A target is optional."
                        action={() => setModal({ type: "goal" })}
                        label="Add your savings"
                      />
                    </section>
                  )}
                  <div className="hint">
                    <Icon name="leaf" size={17} />
                    <p>
                      Savings stay in the accounts that hold them. There is no
                      monthly saving requirement. Spending savings reduces that
                      account’s balance; releasing savings makes the money
                      available again.
                    </p>
                  </div>
                </>
              )}
              {tab === "recurring" && (
                <>
                  <div className="summary-grid">
                    <Summary
                      icon="repeat"
                      label="Monthly fixed expenses"
                      value={fmt(
                        budget.recurring
                          .filter((r) => r.frequency === "monthly")
                          .reduce((s, r) => s + r.amount, 0),
                      )}
                    />
                    <Summary
                      icon="calendar"
                      label="Weekly fixed expenses"
                      value={fmt(
                        budget.recurring
                          .filter((r) => r.frequency === "weekly")
                          .reduce((s, r) => s + r.amount, 0),
                      )}
                      color="purple"
                    />
                    <Summary
                      icon="check"
                      label="Due or overdue"
                      value={String(
                        upcoming.filter((r) => r.due <= today()).length,
                      )}
                      color="peach"
                    />
                  </div>
                  <section className="panel">
                    <SectionTitle
                      title="Your regulars"
                      action={() =>
                        setModal({
                          type: budget.accounts.length
                            ? "recurring"
                            : "account",
                        })
                      }
                      actionLabel="Add expense"
                    />
                    {upcoming.length ? (
                      upcoming.map(recurringRow)
                    ) : (
                      <Empty
                        icon="repeat"
                        title="Give your bills a little order"
                        description="Add weekly and monthly expenses. Mark each one paid to update the account balance and schedule its next due date."
                        action={() =>
                          setModal({
                            type: budget.accounts.length
                              ? "recurring"
                              : "account",
                          })
                        }
                        label={
                          budget.accounts.length
                            ? "Add an expense"
                            : "Add an account first"
                        }
                      />
                    )}
                  </section>
                  <div className="hint">
                    <Icon name="calendar" size={17} />
                    <p>
                      Payments are recorded only when you mark them paid. Each
                      payment moves the due date forward one period, including
                      overdue bills.
                    </p>
                  </div>
                </>
              )}
              {tab === "debts" && (
                <>
                  <div className="summary-grid two">
                    <Summary
                      icon="down"
                      label="People owe you"
                      value={fmt(
                        budget.debts
                          .filter((d) => d.direction === "owed")
                          .reduce((s, d) => s + d.amount - d.paid, 0),
                      )}
                    />
                    <Summary
                      icon="up"
                      label="You owe"
                      value={fmt(
                        budget.debts
                          .filter((d) => d.direction === "owe")
                          .reduce((s, d) => s + d.amount - d.paid, 0),
                      )}
                      color="peach"
                    />
                  </div>
                  <SectionTitle
                    title="Debts & repayments"
                    action={() => setModal({ type: "debt" })}
                    actionLabel="Record a debt"
                  />
                  {budget.debts.length ? (
                    <div className="debt-grid">
                      {[...budget.debts]
                        .sort(
                          (a, b) =>
                            Number(a.paid === a.amount) -
                            Number(b.paid === b.amount),
                        )
                        .map((d) => (
                          <article className="panel debt-card" key={d.id}>
                            <div className="row-between">
                              <span
                                className={`tile ${d.direction === "owe" ? "peach" : "mint"}`}
                              >
                                <Icon name="people" />
                              </span>
                              <span
                                className={`pill ${d.paid === d.amount ? "mint" : ""}`}
                              >
                                {d.paid === d.amount
                                  ? "Settled up"
                                  : d.direction === "owed"
                                    ? "Owes you"
                                    : "You owe"}
                              </span>
                            </div>
                            <div className="row-between">
                              <h3>{d.person}</h3>
                              <button
                                className="icon-button"
                                aria-label={`Edit debt with ${d.person}`}
                                onClick={() =>
                                  setModal({ type: "debt-edit", item: d })
                                }
                              >
                                <Icon name="edit" size={17} />
                              </button>
                            </div>
                            <strong className="debt-amount">
                              {fmt(d.amount - d.paid)}
                            </strong>
                            <p>
                              {fmt(d.paid)} paid of {fmt(d.amount)}
                              {d.due && ` · Due ${formatDate(d.due)}`}
                            </p>
                            {d.note && <p className="debt-note">{d.note}</p>}
                            {d.paid < d.amount && (
                              <button
                                className="button secondary full small"
                                onClick={() =>
                                  setModal({
                                    type: budget.accounts.length
                                      ? "debt-pay"
                                      : "account",
                                    item: budget.accounts.length
                                      ? d
                                      : undefined,
                                  })
                                }
                              >
                                {d.direction === "owed"
                                  ? "Record money received"
                                  : "Record a repayment"}
                                <Icon name="arrow" size={15} />
                              </button>
                            )}
                          </article>
                        ))}
                    </div>
                  ) : (
                    <section className="panel">
                      <Empty
                        icon="people"
                        title="A clean slate"
                        description="Track money you owe and money owed to you. Partial repayments are welcome, too."
                        action={() => setModal({ type: "debt" })}
                        label="Record a debt"
                      />
                    </section>
                  )}
                </>
              )}
              {(tab === "settings" || tab === "more") && (
                <>
                  {tab === "more" && (
                    <div className="more-grid">
                      {navigation.slice(4).map((n) => (
                        <button
                          className="panel more-link"
                          key={n.id}
                          onClick={() => navigate(n.id)}
                        >
                          <span className="tile purple">
                            <Icon name={n.icon} />
                          </span>
                          <strong>{n.label}</strong>
                          <Icon name="arrow" />
                        </button>
                      ))}
                    </div>
                  )}
                  <section className="panel settings-panel">
                    <SectionTitle title="Your personal space" />
                    <div className="settings-row">
                      <div>
                        <h3>Currency</h3>
                        <p>{currency} · One currency across all accounts.</p>
                      </div>
                      <button
                        className="button secondary small"
                        onClick={() => setModal({ type: "settings" })}
                      >
                        Change
                      </button>
                    </div>
                    <div className="settings-row">
                      <div>
                        <h3>Take your data with you</h3>
                        <p>
                          Download your accounts, transactions, and goals as
                          JSON.
                        </p>
                      </div>
                      <button
                        className="button secondary small"
                        onClick={exportData}
                      >
                        <Icon name="download" size={16} />
                        Export
                      </button>
                    </div>
                    <div className="settings-row">
                      <div>
                        <h3>Signed in as {username}</h3>
                        <p>Your own little corner of financial clarity.</p>
                      </div>
                      <button
                        className="button secondary small"
                        onClick={logout}
                      >
                        <Icon name="logout" size={16} />
                        Sign out
                      </button>
                    </div>
                  </section>
                </>
              )}
              <footer className="main-footer">
                <span>
                  <span className="status-dot" />
                  Your money. Your pace.
                </span>
                <span>Made for a little peace of mind.</span>
              </footer>
            </>
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Main navigation">
        {[
          { id: "overview" as Tab, label: "Home", icon: "home" as IconName },
          ...navigation.slice(1, 4).map((n) => ({
            ...n,
            label:
              n.id === "transactions"
                ? "Activity"
                : n.id === "savings"
                  ? "Savings"
                  : n.label,
          })),
          { id: "more" as Tab, label: "More", icon: "more" as IconName },
        ].map((n) => (
          <button
            key={n.id}
            onClick={() => navigate(n.id)}
            className={
              tab === n.id ||
              (n.id === "more" &&
                ["recurring", "debts", "settings", "budgets"].includes(tab))
                ? "active"
                : ""
            }
          >
            <Icon name={n.icon} size={21} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
      {modal && budget && modal.type === "details" && (
        <TransactionDetails
          transaction={
            (budget.transactions.find((t) => t.id === modal.item?.id) ||
              modal.item) as Transaction
          }
          budget={budget}
          fmt={fmt}
          close={() => setModal(null)}
          edit={() => setModal({ type: "transaction-edit", item: modal.item })}
          undo={() => setModal({ type: "transaction-undo", item: modal.item })}
          refund={() => setModal({ type: "refund", item: modal.item })}
        />
      )}
      {modal && budget && modal.type !== "details" && (
        <BudgetModal
          key={`${modal.type}-${modal.item?.id || "new"}`}
          modal={modal}
          budget={budget}
          close={() => setModal(null)}
          onSaved={(data) => {
            setBudget((previous) =>
              previous && previous.revision > data.revision ? previous : data,
            );
            setToast("All saved. You’re up to date.");
            setModal(null);
          }}
          onExpired={() => {
            loadSequence.current++;
            setAuth("out");
            setBudget(null);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function Summary({
  icon,
  label,
  value,
  color = "mint",
}: {
  icon: IconName;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="panel summary">
      <span className={`tile ${color}`}>
        <Icon name={icon} />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function SpendingChart({
  transactions,
  fmt,
}: {
  transactions: Transaction[];
  fmt: (n: number) => string;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      label: d.toLocaleDateString("en", { weekday: "short" }),
      total: transactions
        .filter((t) => t.date === key && spending(t))
        .reduce((s, t) => s + spendingAmount(t), 0),
    };
  });
  const max = Math.max(1, ...days.map((d) => Math.abs(d.total)));
  return (
    <>
      <div className="week-total">
        {fmt(days.reduce((s, d) => s + d.total, 0))}
        <span>last 7 days</span>
      </div>
      <div
        className="chart"
        role="img"
        aria-label={days.map((d) => `${d.label}: ${fmt(d.total)}`).join(", ")}
      >
        {days.map((d, i) => (
          <div className={`chart-column ${i === 6 ? "today" : ""}`} key={i}>
            <div className="chart-bar-track">
              <div
                className={`chart-bar ${d.total < 0 ? "refund-bar" : ""}`}
                title={`${d.label}: ${fmt(d.total)}`}
                style={{
                  height: `${d.total ? Math.max(4, (Math.abs(d.total) / max) * 100) : 2}%`,
                }}
              />
            </div>
            <span>{d.label}</span>
          </div>
        ))}
      </div>
      <p className="chart-note">
        {max === 1 && !days.some((d) => d.total)
          ? "Your spending rhythm will take shape here."
          : "Small moments, a clearer picture."}
      </p>
    </>
  );
}
function Login({
  onSuccess,
  initialError,
}: {
  onSuccess: (name: string) => void;
  initialError: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(data.username);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <header>
        <Brand />
        <span className="login-header-note">
          <Icon name="lock" size={15} />
          Your personal money space
        </span>
      </header>
      <div className="login-layout">
        <section className="login-story">
          <span className="eyebrow">
            <span className="status-dot" />A LITTLE CLARITY GOES A LONG WAY
          </span>
          <h1>
            Good things start
            <br />
            with a little
            <br />
            <span>balance.</span>
          </h1>
          <p>
            A home for your everyday money.
            <br />
            Keep track, set a little aside, and make
            <br className="desktop-break" /> room for what matters.
          </p>
          <div className="login-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-card">
              <div className="row-between">
                <span className="brand-mark">
                  <span />
                  <span />
                  <span />
                </span>
                <Icon name="leaf" size={29} />
              </div>
              <div className="art-lines">
                <span />
                <span />
              </div>
              <span className="art-card-bottom">
                a little today. a lot tomorrow.
              </span>
            </div>
            <div className="art-coin">
              <Icon name="leaf" size={36} />
            </div>
            <span className="art-star">✳</span>
          </div>
        </section>
        <section className="login-card">
          <span className="login-icon">
            <Icon name="wallet" size={27} />
          </span>
          <div className="eyebrow">WELCOME TO YOUR CORNER</div>
          <h2>Make yourself at home.</h2>
          <p>Sign in to see where you stand.</p>
          <form onSubmit={submit}>
            <label>
              Username
              <input
                name="username"
                placeholder="Your username"
                autoComplete="username"
                required
                maxLength={100}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder="Your password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button
              className="button primary full"
              disabled={busy}
              type="submit"
            >
              {busy ? "Signing you in…" : "Let’s get you settled"}
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <div className="login-secure">
            <Icon name="lock" size={14} />
            Just you and your money. Nice and simple.
          </div>
        </section>
      </div>
      <footer>
        <span>Small steps. Better money days.</span>
        <span>budgetly © {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}

function BudgetModal({
  modal,
  budget,
  close,
  onSaved,
  onExpired,
}: {
  modal: Modal;
  budget: Budget;
  close: () => void;
  onSaved: (b: Budget) => void;
  onExpired: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const item = modal.item;
  const [openedRevision] = useState(budget.revision);
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {
      name: "",
      title: "",
      amount: "",
      target: "",
      balance: "0",
      kind: "bank",
      color: "mint",
      accountId: budget.accounts[0]?.id || "",
      toAccountId: budget.accounts[1]?.id || "",
      category: "Other",
      type: modal.preset || "expense",
      date: today(),
      due: today(),
      note: "",
      frequency: "monthly",
      direction: "owed",
      person: "",
      currency: budget.currency,
      moveMoney: "false",
      mode: "",
      month: modal.month || today().slice(0, 7),
      potId: modal.potId || "auto",
      toPotId: budget.pots?.find((p) => p.id !== item?.id)?.id || "",
    };
    if (modal.type === "goal-move") base.type = "saving";
    if (modal.type === "pot-move") base.type = "reserve";
    if (modal.potId)
      base.category =
        budget.pots?.find((p) => p.id === modal.potId)?.category || "Other";
    if (modal.type === "limit") base.category = modal.preset || "All spending";
    if (modal.type === "debt") base.due = "";
    if (item) {
      Object.entries(item).forEach(([key, value]) => {
        if (typeof value === "string" || typeof value === "number")
          base[key] = String(value);
      });
      if ("balance" in item && modal.type === "account") {
        base.balance = amountInput(item.balance);
        base.accountId = item.id;
      }
      if ("target" in item)
        base.target = item.target ? amountInput(item.target) : "";
      if (modal.type === "transaction-edit")
        base.potId = (item as Transaction).potId || "unassigned";
      if ("amount" in item) base.amount = amountInput(item.amount);
      if (modal.type === "debt-pay" && "paid" in item)
        base.amount = amountInput(item.amount - item.paid);
      if (["goal-move", "goal-transfer"].includes(modal.type)) base.amount = "";
      if (modal.type === "goal-transfer") {
        base.accountId =
          (item as Goal).allocations.find((a) => a.amount > 0)?.accountId ||
          base.accountId;
        base.toAccountId =
          budget.accounts.find((a) => a.id !== base.accountId)?.id || "";
      }
      if (modal.type === "refund") {
        base.amount = amountInput(
          refundableAmount(budget, item as Transaction),
        );
        base.date = today();
      }
      if (!["transaction-edit", "debt-edit"].includes(modal.type))
        base.note = "";
    }
    return base;
  });
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  const set = (name: string, value: string) => {
    setFields((previous) => {
      const next = { ...previous, [name]: value };
      if (name === "category") next.potId = "auto";
      if (name === "accountId" && value === previous.toAccountId)
        next.toAccountId =
          budget.accounts.find((a) => a.id !== value)?.id || "";
      if (
        name === "type" &&
        modal.type === "goal-move" &&
        value !== "saving" &&
        !(item as Goal).allocations.some(
          (a) => a.accountId === next.accountId && a.amount > 0,
        )
      )
        next.accountId =
          (item as Goal).allocations.find((a) => a.amount > 0)?.accountId ||
          next.accountId;
      if (name === "potId") {
        const pot = budget.pots?.find((p) => p.id === value);
        if (pot) next.category = pot.category;
      }
      return next;
    });
    setError("");
  };
  const fmt = (amount: number) => money(amount, budget.currency);
  const titles: Record<string, string> = {
    account: item ? "A little account upkeep." : "Give your money a home.",
    transaction: "Record money in or out",
    pot: item ? "Edit spending pot" : "Reserve money for a task",
    "pot-move": "Manage reserved money",
    "goal-transfer": "Move protected savings",
    refund: "Record money returned",
    "transaction-edit": "Make the details right.",
    "transaction-undo": "Undo this transaction?",
    "debt-edit": "Keep the details up to date.",
    limit: "A little direction for your money.",
    goal: item ? "Edit savings" : "Add your savings",
    "goal-move": "Manage your savings",
    recurring: item
      ? "Keep your regulars in order."
      : "Make room for the regulars.",
    "pay-recurring": "One less thing on your list.",
    debt: "Keep things clear.",
    "debt-pay": "A little closer to settled.",
    settings: "Your money, your currency.",
  };
  const labels: Record<string, string> = {
    account: item ? "Edit account" : "New account",
    transaction: "New transaction",
    pot: "Spending pot",
    "pot-move": (item as SpendingPot)?.name,
    "goal-transfer": (item as Goal)?.name,
    refund: "Refund an expense",
    "transaction-edit": "Correct transaction",
    "transaction-undo": "Reverse an entry",
    "debt-edit": "Edit debt",
    limit: "Monthly spending limit",
    goal: item ? "Edit savings" : "Savings balance",
    "goal-move": (item as Goal)?.name,
    recurring: item ? "Edit expense" : "Recurring expense",
    "pay-recurring": "Record a payment",
    debt: "New debt",
    "debt-pay": "Record a repayment",
    settings: "Preferences",
  };
  const needsAccount =
    [
      "transaction",
      "transaction-edit",
      "goal-move",
      "goal-transfer",
      "refund",
      "recurring",
      "pay-recurring",
      "debt-pay",
    ].includes(modal.type) ||
    (modal.type === "debt" && fields.moveMoney === "true");
  function input(
    label: string,
    name: string,
    options: {
      type?: string;
      placeholder?: string;
      required?: boolean;
      maxLength?: number;
      min?: string;
    } = {},
  ) {
    const {
      type = "text",
      placeholder,
      required = true,
      maxLength = 100,
      min,
    } = options;
    return (
      <label>
        {label}
        <input
          type={type}
          name={name}
          value={fields[name] || ""}
          onChange={(e) => set(name, e.target.value)}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          min={min}
          step={type === "number" ? "0.01" : undefined}
          inputMode={type === "number" ? "decimal" : undefined}
        />
      </label>
    );
  }
  function select(
    label: string,
    name: string,
    options: { value: string; label: string }[],
  ) {
    return (
      <label>
        {label}
        <select
          aria-label={label}
          name={name}
          value={fields[name]}
          onChange={(e) => set(name, e.target.value)}
          required
        >
          {!options.length && <option value="">Add an account first</option>}
          {options.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const accountSelect = (label = "Account", name = "accountId") =>
    select(
      label,
      name,
      budget.accounts
        .filter((a) => name !== "toAccountId" || a.id !== fields.accountId)
        .map((a) => {
          const savedHere =
            (modal.type === "goal-transfer" ||
              (modal.type === "goal-move" && fields.type !== "saving")) &&
            name === "accountId";
          const receiving =
            name === "toAccountId" ||
            modal.type === "refund" ||
            (["transaction", "transaction-edit"].includes(modal.type) &&
              fields.type === "income");
          const amount = savedHere
            ? (item as Goal).allocations.find((x) => x.accountId === a.id)
                ?.amount || 0
            : receiving
              ? a.balance
              : available(budget, a.id);
          return {
            value: a.id,
            label: `${a.name} · ${fmt(amount)} ${savedHere ? "saved here" : receiving ? "current balance" : "outside savings"}`,
          };
        }),
    );
  const amountField = (
    name = "amount",
    label = `Amount (${budget.currency})`,
    allowZero = false,
  ) =>
    input(label, name, {
      type: "number",
      placeholder: "0.00",
      min: allowZero ? "0" : "0.01",
    });
  const dateField = () => input("Transaction date", "date", { type: "date" });
  const noteField = () =>
    input("Note (optional)", "note", {
      placeholder: "A little context for later",
      required: false,
      maxLength: 500,
    });
  const categorySelect = () =>
    select(
      "Category",
      "category",
      categories.map((c) => ({ value: c, label: c })),
    );
  const fundingSelect = () => {
    const matches = (budget.pots || []).filter(
      (p) => p.category === fields.category,
    );
    const pot =
      fields.potId === "auto"
        ? matches.length === 1
          ? matches[0]
          : undefined
        : budget.pots?.find((p) => p.id === fields.potId);
    return (
      <>
        {select("Use money from", "potId", [
          {
            value: "auto",
            label:
              matches.length === 1
                ? `Category pot: ${matches[0].name}`
                : matches.length > 1
                  ? "Choose a pot below"
                  : "Unassigned money (no category pot)",
          },
          {
            value: "unassigned",
            label: `Unassigned money · ${fmt(balanceSummary(budget).free)}`,
          },
          ...(budget.pots || [])
            .filter(
              (p) =>
                modal.type !== "pay-recurring" ||
                p.category === fields.category,
            )
            .map((p) => ({
              value: p.id,
              label: `${p.name} · ${fmt(p.balance)} left`,
            })),
        ])}
        <p className="form-hint">
          {pot
            ? `${fmt(pot.balance)} left in ${pot.name}. This expense reduces the pot and the account you pay from together.`
            : matches.length > 1 && fields.potId === "auto"
              ? "There is more than one pot for this category. Select the one you want to use."
              : "This uses money that is not reserved for a pot or savings."}
        </p>
      </>
    );
  };
  const colorPicker = () => (
    <fieldset className="color-picker">
      <legend>Make it yours</legend>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${c} color`}
          aria-pressed={fields.color === c}
          className={`swatch ${c} ${fields.color === c ? "selected" : ""}`}
          onClick={() => set("color", c)}
        >
          {fields.color === c && <Icon name="check" size={17} />}
        </button>
      ))}
    </fieldset>
  );
  const segments = (
    name: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="segmented">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={fields[name] === o.value}
          className={fields[name] === o.value ? "selected" : ""}
          onClick={() => set(name, o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    const actions: Record<string, string> = {
      account: "account.save",
      transaction: "transaction.add",
      pot: "pot.save",
      "pot-move":
        fields.type === "reserve-transfer" ? "pot.transfer" : "pot.move",
      "goal-transfer": "goal.transfer",
      refund: "transaction.refund",
      "transaction-edit": "transaction.edit",
      "transaction-undo": "transaction.undo",
      "debt-edit": "debt.edit",
      limit: "limit.save",
      goal: "goal.save",
      "goal-move": "goal.move",
      recurring: "recurring.save",
      "pay-recurring": "recurring.pay",
      debt: "debt.add",
      "debt-pay": "debt.pay",
      settings: "settings.save",
    };
    let action = actions[modal.type];
    if (modal.type === "account" && fields.mode === "adjust")
      action = "account.adjust";
    if (deleting)
      action = `${modal.type === "debt-edit" ? "debt" : modal.type}.delete`;
    const command = {
      ...fields,
      action,
      id: item?.id,
      moveMoney: fields.moveMoney === "true",
      expectedBalance:
        modal.type === "account" && item && "balance" in item
          ? item.balance
          : undefined,
      expectedRevision:
        (item &&
          ![
            "goal-move",
            "goal-transfer",
            "refund",
            "pot-move",
            "debt-pay",
          ].includes(modal.type)) ||
        modal.type === "limit"
          ? openedRevision
          : undefined,
      expectedDue:
        modal.type === "pay-recurring" ? (item as Recurring).due : undefined,
    };
    const fingerprint = JSON.stringify(command);
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, id: requestId() };
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command, requestId: retry.current.id }),
      });
      const data = await res.json();
      if (res.status === 401) {
        onExpired();
        return;
      }
      if (!res.ok) throw new Error(data.error);
      onSaved(data.budget);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not confirm the save. Please retry; the same change will not be recorded twice.",
      );
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  let content: ReactNode;
  if (deleting)
    content = (
      <div className="delete-confirm">
        <h3>
          Delete this{" "}
          {modal.type === "debt-edit"
            ? "debt"
            : modal.type === "goal"
              ? "savings"
              : modal.type === "pot"
                ? "spending pot"
                : modal.type === "recurring"
                  ? "recurring expense"
                  : "account"}
          ?
        </h3>
        <p>
          {modal.type === "debt-edit"
            ? "Only debts with no active loan or repayment entries can be deleted. Undo linked transactions first."
            : modal.type === "recurring"
              ? "Future reminders will be removed. Previous payments stay in your transaction history."
              : modal.type === "pot"
                ? "Spend or release all money first. Previous activity stays in your history."
                : modal.type === "goal"
                  ? "Savings must be empty. Previous activity stays in your history."
                  : "Only empty accounts with no transactions or recurring expenses can be deleted."}
        </p>
        <button
          type="button"
          className="text-button"
          onClick={() => setDeleting(false)}
        >
          Keep it
        </button>
      </div>
    );
  else
    switch (modal.type) {
      case "pot":
        content = (
          <>
            {input("Pot name", "name", {
              placeholder: "e.g. Food, Home repairs, Birthday",
              maxLength: 60,
            })}
            {categorySelect()}
            {!item &&
              amountField("amount", `Reserve now (${budget.currency})`, true)}
            <p className="form-hint">
              {fmt(balanceSummary(budget).free)} is free to assign. Reserving
              money does not change your total or move money between accounts.
              Expenses in this category use its pot automatically when there is
              only one.
            </p>
          </>
        );
        break;
      case "pot-move":
        content = (
          <>
            <div className="modal-summary">
              <span>{(item as SpendingPot).name} · left to spend</span>
              <strong>{fmt((item as SpendingPot).balance)}</strong>
            </div>
            {segments("type", [
              { value: "reserve", label: "Add money" },
              { value: "reserve-release", label: "Release money" },
              ...(budget.pots!.length > 1
                ? [{ value: "reserve-transfer", label: "Move to pot" }]
                : []),
            ])}
            {amountField()}
            {fields.type === "reserve-transfer" &&
              select(
                "Move to spending pot",
                "toPotId",
                (budget.pots || [])
                  .filter((p) => p.id !== item?.id)
                  .map((p) => ({
                    value: p.id,
                    label: `${p.name} · ${fmt(p.balance)} left`,
                  })),
              )}
            <p className="form-hint">
              {fields.type === "reserve"
                ? `${fmt(balanceSummary(budget).free)} free to assign. This reserves more money for the pot.`
                : fields.type === "reserve-transfer"
                  ? "This changes what the money is reserved for. Account balances and your total stay the same."
                  : "Released money becomes free to assign or spend. Your account balances stay the same."}
            </p>
            {dateField()}
            {noteField()}
          </>
        );
        break;
      case "goal-transfer":
        content = (
          <>
            <p className="form-hint">
              Record a transfer you made between your own accounts. The money
              stays protected in {(item as Goal).name}; your total savings and
              spendable balance stay the same.
            </p>
            {amountField()}
            {accountSelect("Move savings from")}
            {accountSelect("Move savings to", "toAccountId")}
            {dateField()}
            {noteField()}
          </>
        );
        break;
      case "refund": {
        const original = item as Transaction;
        content = (
          <>
            <div className="modal-summary">
              <span>{original.title}</span>
              <strong>{fmt(refundableAmount(budget, original))}</strong>
              <span>Still refundable</span>
            </div>
            {amountField()}
            {accountSelect("Refund received into")}
            {dateField()}
            {noteField()}
            <p className="form-hint">
              Record only money actually returned. A partial refund is fine.
              This reduces spending in {original.category} on the refund date,
              without counting as income.{" "}
              {original.potId
                ? "The money returns to the original spending pot."
                : original.type === "saving-spent"
                  ? "The money returns to protected savings in the receiving account."
                  : "The money becomes free to assign or spend."}
            </p>
          </>
        );
        break;
      }
      case "account":
        content = (
          <>
            {item &&
              segments("mode", [
                { value: "", label: "Account details" },
                { value: "adjust", label: "Correct balance" },
              ])}
            {fields.mode === "adjust" ? (
              <>
                <p className="form-hint">
                  Set the actual balance of {(item as Account).name}. The
                  difference is recorded as a correction, not income or
                  spending.
                </p>
                {amountField(
                  "balance",
                  `Actual balance (${budget.currency})`,
                  true,
                )}
                {dateField()}
                {noteField()}
              </>
            ) : (
              <>
                {input("Account name", "name", {
                  placeholder: "e.g. Main bank, Everyday wallet",
                  maxLength: 40,
                })}
                {select("Account type", "kind", [
                  { value: "bank", label: "Bank account" },
                  { value: "wallet", label: "Digital wallet" },
                  { value: "cash", label: "Cash" },
                ])}
                {!item && (
                  <>
                    {amountField(
                      "balance",
                      `Current balance (${budget.currency})`,
                      true,
                    )}
                    <p className="form-hint">
                      Start with what you have right now. You can record future
                      transactions as they happen.
                    </p>
                  </>
                )}
                {colorPicker()}
              </>
            )}
          </>
        );
        break;
      case "transaction":
      case "transaction-edit":
        content = (
          <>
            {segments("type", [
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
              { value: "transfer", label: "Transfer" },
            ])}
            {amountField()}
            {input("What was it for?", "title", {
              placeholder:
                fields.type === "income"
                  ? "e.g. Monthly salary"
                  : fields.type === "transfer"
                    ? "e.g. Cash withdrawal"
                    : "e.g. Coffee & a little treat",
            })}
            {accountSelect(
              fields.type === "income" ? "Received into" : "Paid from",
            )}
            {fields.type === "transfer"
              ? accountSelect("Transfer to", "toAccountId")
              : categorySelect()}
            {fields.type === "expense" && fundingSelect()}
            {dateField()}
            {noteField()}
          </>
        );
        break;
      case "goal":
        content = (
          <>
            {input("Savings name", "name", {
              placeholder: "e.g. Rainy day fund, A little getaway",
              maxLength: 60,
            })}
            {!item && (
              <>
                {input(`Already saved (${budget.currency})`, "amount", {
                  type: "number",
                  min: "0",
                  required: false,
                  placeholder: "0.00",
                })}
                {accountSelect("Account holding this money")}
              </>
            )}
            {input(`Target amount (optional, ${budget.currency})`, "target", {
              type: "number",
              min: "0",
              required: false,
              placeholder: "No target needed",
            })}
            <p className="form-hint">
              Enter money already included in an account’s balance. It stays in
              your total, but is excluded from spendable money. Savings carry
              forward with no monthly requirement.
            </p>
            {colorPicker()}
          </>
        );
        break;
      case "goal-move": {
        const goal = item as Goal;
        const allocation =
          goal.allocations.find((a) => a.accountId === fields.accountId)
            ?.amount || 0;
        content = (
          <>
            <div className="modal-summary">
              <span>Saved in {goal.name}</span>
              <strong>
                {fmt(goalBalance(goal))}
                {goal.target > 0 && <small> / {fmt(goal.target)}</small>}
              </strong>
            </div>
            {segments("type", [
              { value: "saving", label: "Add money" },
              { value: "saving-spent", label: "Spend savings" },
              { value: "release", label: "Release" },
            ])}
            {amountField()}
            {accountSelect(
              fields.type === "saving"
                ? "Set aside from"
                : "Account holding the savings",
            )}
            <p className="form-hint">
              {fields.type === "saving"
                ? "This protects money as savings. Your account and total balances stay the same, while spendable money decreases."
                : `${fmt(allocation)} of this goal is held in the selected account. ${fields.type === "saving-spent" ? "Spending reduces both this goal and the account balance." : "Releasing returns this money to your available balance without spending it."}`}
            </p>
            {fields.type === "saving-spent" && (
              <>
                {categorySelect()}
                <div className="hint">
                  <Icon name="leaf" size={17} />
                  <p>
                    You are choosing to use protected savings. This reduces your
                    savings and the account holding them. Spending pots stay
                    unchanged.
                  </p>
                </div>
              </>
            )}
            {dateField()}
            {noteField()}
          </>
        );
        break;
      }
      case "recurring":
        content = (
          <>
            {input("Expense name", "name", {
              placeholder: "e.g. Netflix, Internet, Weekly groceries",
              maxLength: 60,
            })}
            {amountField()}
            {segments("frequency", [
              { value: "monthly", label: "Every month" },
              { value: "weekly", label: "Every week" },
            ])}
            {input("Next due date", "due", { type: "date" })}
            {accountSelect("Pay from")}
            {categorySelect()}
            <p className="form-hint">
              We’ll keep it on your list. Your balance changes only when you
              mark the expense paid.
            </p>
          </>
        );
        break;
      case "pay-recurring": {
        const r = item as Recurring;
        content = (
          <>
            <div className="modal-summary">
              <span>
                {r.name} · Due {formatDate(r.due)}
              </span>
              <strong>{fmt(r.amount)}</strong>
              <span>
                From {budget.accounts.find((a) => a.id === r.accountId)?.name}
              </span>
            </div>
            {fundingSelect()}
            {dateField()}
            {noteField()}
            <p className="form-hint">
              This records an expense, updates your account balance, and
              advances the due date by one{" "}
              {r.frequency === "weekly" ? "week" : "month"}.
            </p>
          </>
        );
        break;
      }
      case "debt":
        content = (
          <>
            {segments("direction", [
              { value: "owed", label: "Someone owes me" },
              { value: "owe", label: "I owe someone" },
            ])}
            {input("Person’s name", "person", {
              placeholder: "Who’s on the other side?",
              maxLength: 60,
            })}
            {amountField()}
            {input("Due date (optional)", "due", {
              type: "date",
              required: false,
            })}
            {noteField()}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={fields.moveMoney === "true"}
                onChange={(e) => set("moveMoney", String(e.target.checked))}
              />
              <span>
                This money is changing hands now
                <small>
                  Also{" "}
                  {fields.direction === "owed"
                    ? "deduct the loan from"
                    : "add the borrowed money to"}{" "}
                  an account.
                </small>
              </span>
            </label>
            {fields.moveMoney === "true" ? (
              <>
                {accountSelect()}
                {dateField()}
              </>
            ) : (
              <p className="form-hint">
                Recording an existing debt won’t change any balance. Future
                repayments will.
              </p>
            )}
          </>
        );
        break;
      case "debt-pay": {
        const d = item as Debt;
        content = (
          <>
            <div className="modal-summary">
              <span>
                {d.direction === "owe" ? "You owe" : "Owed to you by"}{" "}
                {d.person}
              </span>
              <strong>{fmt(d.amount - d.paid)}</strong>
            </div>
            {amountField()}
            {accountSelect(
              d.direction === "owe" ? "Repay from" : "Received into",
            )}
            {dateField()}
            {noteField()}
            <p className="form-hint">
              You can record a partial payment. Your account balance and the
              remaining debt update together.
            </p>
          </>
        );
        break;
      }
      case "transaction-undo": {
        const t = item as Transaction;
        content = (
          <>
            <div className="modal-summary">
              <span>{t.title}</span>
              <strong>{fmt(t.amount)}</strong>
              <span>{formatDate(t.date)}</span>
            </div>
            <p className="form-hint">
              This reverses the entry’s account and linked savings, debt, or
              bill changes. It remains visible in voided history and stops
              counting toward reports. If later entries depend on it, undo those
              first.
            </p>
            {input("Reason (optional)", "note", {
              required: false,
              maxLength: 500,
              placeholder: "e.g. Duplicate entry",
            })}
          </>
        );
        break;
      }
      case "debt-edit":
        content = (
          <>
            {input("Person’s name", "person", { maxLength: 60 })}
            {amountField()}
            {input("Due date (optional)", "due", {
              type: "date",
              required: false,
            })}
            {noteField()}
            <p className="form-hint">
              Names, due dates, and notes can be updated. The original amount
              can change only when there are no active loan or repayment
              transactions.
            </p>
          </>
        );
        break;
      case "limit":
        content = (
          <>
            {input("Budget month", "month", { type: "month" })}
            {select(
              "Spending category",
              "category",
              ["All spending", ...categories, "Savings"].map((c) => ({
                value: c,
                label: c,
              })),
            )}
            {amountField("amount", `Monthly limit (${budget.currency})`, true)}
            <p className="form-hint">
              Applies only to the selected month. Set the amount to zero to
              remove this limit. Saving allocations and transfers do not count
              as spending.
            </p>
          </>
        );
        break;
      case "settings":
        content = (
          <>
            {select(
              "Display currency",
              "currency",
              currencies.map((c) => ({ value: c, label: c })),
            )}
            <p className="form-hint">
              This changes the currency label across your budget. Existing
              amounts are not converted. All accounts must use the same
              currency.
            </p>
          </>
        );
        break;
    }
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="modal-header">
        <span className="eyebrow">{labels[modal.type]}</span>
        <button
          className="icon-button"
          onClick={close}
          disabled={busy}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      <h2 id="modal-title">{titles[modal.type]}</h2>
      <form onSubmit={submit}>
        <fieldset className="form-fields" disabled={busy}>
          {content}
        </fieldset>
        {needsAccount && !budget.accounts.length && !deleting && (
          <p className="form-error">
            Add an account before recording this transaction.
          </p>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="submit"
            className={`button ${deleting ? "danger" : "primary"} full`}
            disabled={
              busy || (needsAccount && !budget.accounts.length && !deleting)
            }
          >
            {busy
              ? "Saving…"
              : deleting
                ? "Delete"
                : modal.type === "transaction-undo"
                  ? "Confirm undo"
                  : modal.type === "pay-recurring"
                    ? "Confirm payment"
                    : "Save changes"}
            {!busy && <Icon name={deleting ? "close" : "check"} size={17} />}
          </button>
          {!deleting &&
            item &&
            ["account", "goal", "pot", "recurring", "debt-edit"].includes(
              modal.type,
            ) && (
              <button
                type="button"
                className="delete-button"
                disabled={busy}
                onClick={() => {
                  setDeleting(true);
                  setError("");
                }}
              >
                Delete{" "}
                {modal.type === "debt-edit"
                  ? "debt"
                  : modal.type === "pot"
                    ? "pot"
                    : modal.type === "goal"
                      ? "savings"
                      : modal.type === "recurring"
                        ? "expense"
                        : "account"}
              </button>
            )}
        </div>
      </form>
    </dialog>
  );
}
