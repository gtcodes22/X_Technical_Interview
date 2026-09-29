"""Offline ingest: kopano_data.xlsx + Knowledge_Base/ -> data/generated/*.json (the contract).

Python cleans, DuckDB SQL matches and checks, Python writes. See docs/ARCHITECTURE.md §4.
Run from the repo root:  .venv/Scripts/python scripts/ingest.py  [--keep-db]
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from kopano.cleaning import (  # noqa: E402
    normalise_phone,
    normalise_reference,
    parse_received_at,
    to_iso_date,
    to_thebe,
)
from kopano.kb import build_chunks  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "kopano_data.xlsx"
KB_DIR = ROOT / "Knowledge_Base"
OUT = ROOT / "data" / "generated"
SQL_DIR = Path(__file__).parent / "sql"

SCHEMA_VERSION = "1.0"
AS_AT = "2026-09-30"  # Read Me: loan book as at close of business Wed 30 Sep 2026
TODAY = "2026-10-06"


def load_loans() -> pd.DataFrame:
    raw = pd.read_excel(XLSX, sheet_name="Loans", usecols="A:U", dtype={"phone": str, "id_last4": str})
    raw = raw[raw["loan_id"].astype(str).str.fullmatch(r"KM-L-\d{4}")].copy()  # drops stray formula rows
    loans = pd.DataFrame(
        {
            "loan_id": raw["loan_id"],
            "borrower_id": raw["borrower_id"],
            "first_name": raw["first_name"].str.strip(),
            "last_name": raw["last_name"].str.strip(),
            "phone_raw": raw["phone"].astype(str),
            "phone_normalised": raw["phone"].map(normalise_phone),
            "id_last4": raw["id_last4"].astype(str).str.replace(r"\.0$", "", regex=True).str.zfill(4),
            "branch": raw["branch"],
            "loan_officer": raw["loan_officer"],
            "product": raw["product"],
            "disbursed_on": raw["disbursed_on"].map(to_iso_date),
            "principal_thebe": raw["principal_bwp"].map(to_thebe),
            "term_months": raw["term_months"].astype(int),
            "monthly_instalment_thebe": raw["monthly_instalment_bwp"].map(to_thebe),
            "instalments_paid": raw["instalments_paid"].astype(int),
            "arrears_thebe": raw["arrears_bwp"].map(to_thebe),
            "penalties_thebe": raw["penalties_bwp"].map(to_thebe),
            "outstanding_balance_thebe": raw["outstanding_balance_bwp"].map(to_thebe),
            "next_due_date": raw["next_due_date"].map(to_iso_date),
            "days_overdue": raw["days_overdue"].astype(int),
            "status": raw["status"],
            "payment_holiday_used": raw["payment_holiday_used"].astype(str).str.lower().eq("yes"),
        }
    )
    return loans.reset_index(drop=True)


def load_payments() -> pd.DataFrame:
    raw = pd.read_excel(XLSX, sheet_name="Payments", dtype=str).dropna(how="all")
    raw = raw[raw["txn_ref"].notna()].reset_index(drop=True)
    parsed = raw["received_at"].map(parse_received_at)
    return pd.DataFrame(
        {
            "row_id": range(1, len(raw) + 1),
            "txn_ref": raw["txn_ref"].str.strip(),
            "received_at": parsed.map(lambda p: p[0]),
            "received_date_only": parsed.map(lambda p: p[1]),
            "channel": raw["channel"],
            "payer_name": raw["payer_name"].fillna("").str.strip(),
            "payer_phone_raw": raw["payer_phone"].fillna(""),
            "payer_phone_normalised": raw["payer_phone"].map(normalise_phone),
            "reference_raw": raw["payment_reference"].fillna(""),
            "reference_normalised": raw["payment_reference"].map(normalise_reference),
            "amount_raw": raw["amount"].fillna(""),
            "amount_thebe": raw["amount"].map(to_thebe),
        }
    )


def run_sql(con: duckdb.DuckDBPyConnection) -> None:
    for path in sorted(SQL_DIR.glob("0*.sql")):
        con.execute(path.read_text(encoding="utf-8"))


def run_checks(con: duckdb.DuckDBPyConnection) -> list[str]:
    failures = []
    text = (SQL_DIR / "90_checks.sql").read_text(encoding="utf-8")
    for block in text.split(";"):
        name = next((l[len("-- check:"):].strip() for l in block.splitlines() if l.startswith("-- check:")), None)
        sql = "\n".join(l for l in block.splitlines() if not l.strip().startswith("--")).strip()
        if not sql:
            continue
        rows = con.execute(sql).fetchall()
        if rows:
            failures.append(f"{name}: {len(rows)} row(s), e.g. {rows[:3]}")
    return failures


def records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", force_ascii=False))


def write(name: str, payload: object) -> None:
    # newline="\n" keeps output byte-identical on Windows and Linux, so CI's drift check is reliable.
    (OUT / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    loans = load_loans()
    payments = load_payments()

    con = duckdb.connect(str(ROOT / "data" / "build" / "kopano.duckdb") if "--keep-db" in sys.argv else ":memory:")
    con.register("loans_df", loans)
    con.register("payments_df", payments)
    con.execute("CREATE OR REPLACE TABLE loans AS SELECT * FROM loans_df")
    con.execute("CREATE OR REPLACE TABLE payments AS SELECT * FROM payments_df")
    run_sql(con)

    failures = run_checks(con)
    if failures:
        print("INGEST FAILED — data-quality checks returned rows:", *failures, sep="\n  ")
        return 1

    allocations = con.execute("SELECT * FROM allocations ORDER BY row_id").df()
    dup = con.execute("SELECT row_id, first_row_id FROM payments_dedup WHERE occurrence > 1").fetchall()
    dup_map = {row_id: first for row_id, first in dup}
    payments["is_duplicate_of"] = payments["row_id"].map(lambda r: dup_map.get(r))
    summary = con.execute("SELECT * FROM allocation_summary").fetchall()

    chunks = build_chunks(KB_DIR)

    OUT.mkdir(parents=True, exist_ok=True)
    write("loans.json", records(loans))
    write("payments.json", records(payments))
    write("allocations.json", records(allocations))
    write("kb-chunks.json", chunks)
    write(
        "manifest.json",
        {
            "schema_version": SCHEMA_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "as_at": AS_AT,
            "today": TODAY,
            "sources": [
                {"path": str(p.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256(p)}
                for p in [XLSX, *sorted(KB_DIR.iterdir())]
            ],
            "counts": {
                "loans": len(loans),
                "payments": len(payments),
                "kb_chunks": len(chunks),
                "allocations_by_status": {s: {"payments": n, "amount_thebe": int(a or 0)} for s, n, a in summary},
            },
        },
    )

    print(f"loans {len(loans)} · payments {len(payments)} · kb chunks {len(chunks)}")
    for status, n, amount in summary:
        print(f"  {status:<13} {n:>3} payments  P{(amount or 0) / 100:,.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
