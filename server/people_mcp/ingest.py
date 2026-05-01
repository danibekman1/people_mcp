"""CSV -> SQLite ingestion.

Idempotent: a row count match against the CSV header line skips re-ingest.
Strict on present values (bad dates/currencies abort), permissive on missing
ones (the CSV contains 'pending_arrival' rows where most fields are empty).
"""
from __future__ import annotations
import csv
import sqlite3
from datetime import datetime
from pathlib import Path

VALID_CURRENCIES = {"USD", "GBP", "ILS"}

# CSV header -> people table column. Order doesn't matter, names do.
COLUMN_MAP = {
    "Full Name": "full_name",
    "First Name": "first_name",
    "Last Name": "last_name",
    "Work Status": "work_status",
    "Start Date": "start_date",
    "Job": "job",
    "Work Email": "work_email",
    "Team": "team",
    "Reports To": "reports_to",
    "Office": "office",
    "Salary Amount": "salary_amount",
    "Salary Currency": "salary_currency",
    "Salary Type": "salary_type",
    "Country": "country",
    "City": "city",
    "Date of Birth": "date_of_birth",
    "Gender": "gender",
    "Contract Type": "contract_type",
    # 'Tenure' is intentionally ignored; we compute from start_date.
}

# Required (NOT NULL in schema) fields the CSV must provide for every row.
REQUIRED = {"full_name", "first_name", "last_name", "work_status", "work_email"}

INSERT_SQL = """
INSERT INTO people (
  full_name, first_name, last_name, work_status, start_date, job,
  work_email, team, reports_to, office, salary_amount, salary_currency,
  salary_type, country, city, date_of_birth, gender, contract_type
) VALUES (
  :full_name, :first_name, :last_name, :work_status, :start_date, :job,
  :work_email, :team, :reports_to, :office, :salary_amount, :salary_currency,
  :salary_type, :country, :city, :date_of_birth, :gender, :contract_type
)
"""


def parse_date(s: str) -> str:
    """Convert DD/MM/YYYY to ISO YYYY-MM-DD."""
    return datetime.strptime(s.strip(), "%d/%m/%Y").date().isoformat()


def parse_currency(s: str) -> str | None:
    """Strip symbol from a 'USD $' / 'GBP £' style cell, return ISO code.
    Returns None for empty input (some rows lack salary entirely)."""
    cleaned = (s or "").strip()
    if not cleaned:
        return None
    code = cleaned.split(" ")[0].upper()
    if code not in VALID_CURRENCIES:
        raise ValueError(f"unknown currency: {s!r}")
    return code


def ingest_csv(conn: sqlite3.Connection, csv_path: Path) -> int:
    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            row = {}
            for csv_col, db_col in COLUMN_MAP.items():
                if csv_col not in raw:
                    raise ValueError(f"CSV missing expected column: {csv_col}")
                value = (raw[csv_col] or "").strip() or None

                if value is None:
                    if db_col in REQUIRED:
                        raise ValueError(f"missing required {csv_col}")
                    row[db_col] = None
                    continue

                if db_col in ("start_date", "date_of_birth"):
                    value = parse_date(value)
                elif db_col == "salary_currency":
                    value = parse_currency(value)
                elif db_col == "salary_amount":
                    value = float(value.replace(",", ""))
                row[db_col] = value
            rows.append(row)

    # Idempotency: if existing count matches incoming, no-op.
    existing = conn.execute("SELECT COUNT(*) FROM people").fetchone()[0]
    if existing == len(rows):
        return existing

    # Otherwise wipe and reload (simpler than diffing for a small demo dataset).
    conn.execute("DELETE FROM people")
    conn.executemany(INSERT_SQL, rows)
    conn.commit()
    return len(rows)
