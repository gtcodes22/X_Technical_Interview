// Account answers. EVERY figure here comes from loans.json / allocations.json and is formatted
// in code — the LLM never produces or edits a number (AGENTS.md rule 1).

import type { Contract, Loan } from "./contract";
import { normalisePhone } from "./phone";

export interface AccountCardLoan {
  loanId: string;
  product: string;
  inArrears: boolean;
  nextDueDate: string; // for loans in arrears: the OLDEST unpaid instalment date
  amountDueThebe: number; // instalment, or arrears + penalties when in arrears
  monthlyInstalmentThebe: number;
  outstandingBalanceThebe: number;
  receivedNotReflectedThebe: number; // matched payments since the loan-book export
}

export interface AccountCard {
  asAt: string;
  loans: AccountCardLoan[];
}

/** Both details must match the SAME loan record (privacy-and-verification.pdf). */
export function findVerifiedLoans(contract: Contract, phoneInput: string, idLast4Input: string): Loan[] {
  const phone = normalisePhone(phoneInput);
  const idLast4 = idLast4Input.replace(/\D/g, "");
  if (!phone || idLast4.length !== 4) return [];
  const match = contract.loans.find((loan) => loan.phone_normalised === phone && loan.id_last4 === idLast4);
  if (!match) return [];
  // A borrower may hold more than one loan (e.g. KB-10078); show all of theirs.
  return contract.loans.filter((loan) => loan.borrower_id === match.borrower_id);
}

export function buildAccountCard(contract: Contract, loanIds: string[]): AccountCard {
  const loans = contract.loans.filter((loan) => loanIds.includes(loan.loan_id));
  return {
    asAt: contract.manifest.as_at,
    loans: loans.map((loan) => {
      const inArrears = loan.arrears_thebe > 0;
      return {
        loanId: loan.loan_id,
        product: loan.product,
        inArrears,
        nextDueDate: loan.next_due_date,
        amountDueThebe: inArrears ? loan.arrears_thebe + loan.penalties_thebe : loan.monthly_instalment_thebe,
        monthlyInstalmentThebe: loan.monthly_instalment_thebe,
        outstandingBalanceThebe: loan.outstanding_balance_thebe,
        receivedNotReflectedThebe: matchedPaymentsTotal(contract, loan.loan_id),
      };
    }),
  };
}

/** Only `matched` payments count — anything uncertain goes to a human instead (ARCHITECTURE.md §4.2). */
function matchedPaymentsTotal(contract: Contract, loanId: string): number {
  const matchedRowIds = new Set(
    contract.allocations.filter((a) => a.loan_id === loanId && a.status === "matched").map((a) => a.row_id),
  );
  return contract.payments
    .filter((payment) => matchedRowIds.has(payment.row_id))
    .reduce((total, payment) => total + (payment.amount_thebe ?? 0), 0);
}

/** Payments that MIGHT be this customer's but need staff review — attached to "I already paid" handovers. */
export function paymentCandidates(contract: Contract, loanIds: string[], phone: string | null): string[] {
  return contract.allocations
    .filter((a) => a.status === "needs_review" && ((a.loan_id && loanIds.includes(a.loan_id)) || false))
    .map((a) => {
      const payment = contract.payments.find((p) => p.row_id === a.row_id)!;
      return `${payment.txn_ref} · ${formatPula(payment.amount_thebe ?? 0)} · ${payment.received_at?.slice(0, 10)} · ${a.reason}`;
    })
    .concat(
      phone
        ? contract.payments
            .filter((p) => p.payer_phone_normalised === phone)
            .map((p) => `${p.txn_ref} · ${formatPula(p.amount_thebe ?? 0)} · paid from the customer's phone`)
        : [],
    );
}

/** 198000 -> "P1,980.00" */
export function formatPula(thebe: number): string {
  return `P${(thebe / 100).toLocaleString("en-BW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2026-10-25" -> "25 October 2026" */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
