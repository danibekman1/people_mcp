"""SQLite connection and schema management."""
from __future__ import annotations
import sqlite3
from pathlib import Path

# Most fields are nullable to accommodate 'pending_arrival' employees who have
# only a name and email recorded. Only identifying fields are NOT NULL.
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS people (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name       TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  work_status     TEXT NOT NULL,
  start_date      DATE,
  job             TEXT,
  work_email      TEXT NOT NULL UNIQUE,
  team            TEXT,
  reports_to      TEXT,
  office          TEXT,
  salary_amount   REAL,
  salary_currency TEXT,
  salary_type     TEXT,
  country         TEXT,
  city            TEXT,
  date_of_birth   DATE,
  gender          TEXT,
  contract_type   TEXT
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
