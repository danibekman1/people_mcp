"""SQLite connection and schema management."""
from __future__ import annotations
import sqlite3
from pathlib import Path

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS people (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name       TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  work_status     TEXT NOT NULL,
  start_date      DATE NOT NULL,
  job             TEXT NOT NULL,
  work_email      TEXT NOT NULL UNIQUE,
  team            TEXT NOT NULL,
  reports_to      TEXT,
  office          TEXT NOT NULL,
  salary_amount   REAL NOT NULL,
  salary_currency TEXT NOT NULL,
  salary_type     TEXT NOT NULL,
  country         TEXT NOT NULL,
  city            TEXT NOT NULL,
  date_of_birth   DATE NOT NULL,
  gender          TEXT,
  contract_type   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_people_team    ON people(team);
CREATE INDEX IF NOT EXISTS idx_people_office  ON people(office);
CREATE INDEX IF NOT EXISTS idx_people_country ON people(country);
CREATE INDEX IF NOT EXISTS idx_people_city    ON people(city);
CREATE INDEX IF NOT EXISTS idx_people_reports ON people(reports_to);
"""

def connect(db_path: Path | str) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    conn.commit()
