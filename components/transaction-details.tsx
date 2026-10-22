"use client";
import { useEffect, useRef } from "react";
import {
  canEditTransaction,
  canUndoTransaction,
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
}: {
  transaction: Transaction;
  budget: Budget;
  fmt: (n: number) => string;
  close: () => void;
  edit: () => void;
  undo: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
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
            "Removed account"}
        </dd>
        {t.toAccountId && (
          <>
            <dt>To account</dt>
            <dd>{budget.accounts.find((a) => a.id === t.toAccountId)?.name}</dd>
          </>
        )}
        <dt>Category</dt>
        <dd>{t.category}</dd>
        {t.note && (
          <>
            <dt>Note</dt>
            <dd>{t.note}</dd>
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
          {canEditTransaction(t)
            ? "Correct an amount, date, account, or category. The earlier version stays in your voided history."
            : "Linked entries update their bill, savings goal, or debt. Undo the entry before recording a corrected one."}
        </p>
      )}
      <div className="modal-actions">
        {canEditTransaction(t) && (
          <button className="button primary full" onClick={edit}>
            <Icon name="edit" size={17} />
            Edit transaction
          </button>
        )}
        {canUndoTransaction(t) && (
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
