// Types and loader for data/generated/ — the JSON contract written by the Python ingest.
// See docs/ARCHITECTURE.md §4.1. Money is integer thebe (1 pula = 100 thebe) everywhere.

import manifestJson from "../../data/generated/manifest.json";
import loansJson from "../../data/generated/loans.json";
import allocationsJson from "../../data/generated/allocations.json";
import paymentsJson from "../../data/generated/payments.json";
import chunksJson from "../../data/generated/kb-chunks.json";

export const SUPPORTED_SCHEMA_MAJOR = 1;

export interface Loan {
  loan_id: string;
  borrower_id: string;
  first_name: string;
  last_name: string;
  phone_normalised: string;
  id_last4: string;
  product: string;
  monthly_instalment_thebe: number;
  arrears_thebe: number;
  penalties_thebe: number;
  outstanding_balance_thebe: number;
  /** For loans in arrears this is the OLDEST UNPAID instalment date, not the next future one. */
  next_due_date: string;
  days_overdue: number;
  status: string;
}

export interface Payment {
  row_id: number;
  txn_ref: string;
  received_at: string | null;
  channel: string;
  payer_name: string;
  payer_phone_normalised: string | null;
  amount_thebe: number | null;
}

export type AllocationStatus = "matched" | "needs_review" | "duplicate" | "unmatched";

export interface Allocation {
  row_id: number;
  loan_id: string | null;
  status: AllocationStatus;
  method: "reference" | "phone" | "none";
  reason: string;
}

export interface KbChunk {
  chunk_id: string;
  document: string;
  title: string;
  section: string;
  text: string;
  version: string | null;
  superseded: boolean;
}

export interface Manifest {
  schema_version: string;
  as_at: string;
  today: string;
}

export interface Contract {
  manifest: Manifest;
  loans: Loan[];
  payments: Payment[];
  allocations: Allocation[];
  chunks: KbChunk[];
}

/** Refuses to run on a contract with an unknown major version rather than misread the data. */
export function loadContract(): Contract {
  const manifest = manifestJson as Manifest;
  const major = Number(manifest.schema_version.split(".")[0]);
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    throw new Error(`Unsupported data contract schema ${manifest.schema_version}; expected ${SUPPORTED_SCHEMA_MAJOR}.x`);
  }
  return {
    manifest,
    loans: loansJson as Loan[],
    payments: paymentsJson as Payment[],
    allocations: allocationsJson as Allocation[],
    chunks: chunksJson as KbChunk[],
  };
}
