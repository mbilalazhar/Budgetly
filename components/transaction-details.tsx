"use client";
import { useEffect, useRef } from "react";
import {
  canEditTransaction,
  canUndoTransaction,
  refundableAmount,
  type Budget,
  type Transaction,
} from "@/lib/types";
import { Icon } from "./icons";
export function TransactionDetails({
  transaction: t,
  budget,
  fmt,
  close,
  edit,
  undo,
  refund,
}: {
  transaction: Transaction;
  budget: Budget;
  fmt: (n: number) => string;
  close: () => void;
  edit: () => void;
  undo: () => void;
  refund: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const hasRefunds = budget.transactions.some(
    (r) => !r.voidedAt && r.refundOfId === t.id,
  );
  useEffect(() => {
    dialog.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={dialog}
      aria-labelledby="transaction-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-header">
        <span className="eyebrow">Transaction details</span>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
      <h2 id="transaction-title">{t.title}</h2>
      <div className="modal-summary">
        <span>
          {t.voidedAt
            ? "Voided · excluded from balances and reports"
            : t.type.replaceAll("-", " ")}
        </span>
        <strong>{fmt(t.amount)}</strong>
        <span>
          {new Date(`${t.date}T12:00:00`).toLocaleDateString("en", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      <dl className="transaction-details">
        <dt>Account</dt>
        <dd>
          {budget.accounts.find((a) => a.id === t.accountId)?.name ||
            (t.type.startsWith("reserve")
              ? "No money moved between accounts"
              : "Removed account")}
        </dd>
        {t.toAccountId && (
          <>
            <dt>To account</dt>
            <dd>{budget.accounts.find((a) => a.id === t.toAccountId)?.name}</dd>
          </>
        )}
        <dt>Category</dt>
        <dd>{t.category}</dd>
        {t.potId && (
          <>
            <dt>Spending pot</dt>
            <dd>
              {budget.pots?.find((p) => p.id === t.potId)?.name ||
                "Removed pot"}
            </dd>
          </>
        )}
        {t.note && (
          <>
            <dt>Note</dt>
            <dd>{t.note}</dd>
          </>
        )}
        {t.toPotId && (
          <>
            <dt>To spending pot</dt>
            <dd>
              {budget.pots?.find((p) => p.id === t.toPotId)?.name ||
                "Removed pot"}
            </dd>
          </>
        )}
        {t.refundOfId && (
          <>
            <dt>Refund of</dt>
            <dd>
              {budget.transactions.find(
                (original) => original.id === t.refundOfId,
              )?.title || "Original expense"}
            </dd>
          </>
        )}
        {!t.voidedAt && ["expense", "saving-spent"].includes(t.type) && (
          <>
            <dt>Refunded so far</dt>
            <dd>{fmt(t.amount - refundableAmount(budget, t))}</dd>
          </>
        )}
        {t.voidedAt && (
          <>
            <dt>Undone on</dt>
            <dd>{new Date(t.voidedAt).toLocaleString()}</dd>
            <dt>Reason</dt>
            <dd>{t.voidReason}</dd>
          </>
        )}
        {t.replacesId && (
          <>
            <dt>Correction</dt>
            <dd>Replaces an earlier entry retained in voided history.</dd>
          </>
        )}
      </dl>
      {!t.voidedAt && (
        <p className="form-hint">
          {hasRefunds
            ? "This expense has recorded refunds. Undo those refund entries in Activity before editing or undoing the original expense."
            : canEditTransaction(t)
              ? "Correct an amount, date, account, or category. The earlier version stays in your voided history."
              : "Linked entries update their bill, savings goal, or debt. Undo the entry before recording a corrected one."}
        </p>
      )}
      <div className="modal-actions">
        {refundableAmount(budget, t) > 0 && (
          <button className="button secondary full" onClick={refund}>
            Record refund
          </button>
        )}
        {canEditTransaction(t) && !hasRefunds && (
          <button className="button primary full" onClick={edit}>
            <Icon name="edit" size={17} />
            Edit transaction
          </button>
        )}
        {canUndoTransaction(t) && !hasRefunds && (
          <button className="button secondary full" onClick={undo}>
            Undo transaction
          </button>
        )}
        <button className="text-button" onClick={close}>
          Close
        </button>
      </div>
    </dialog>
  );
}
