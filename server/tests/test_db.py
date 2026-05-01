import sqlite3
from pathlib import Path
from people_mcp.db import connect, ensure_schema, SCHEMA_SQL

def test_ensure_schema_creates_people_table(tmp_path):
    db_path = tmp_path / "test.db"
    conn = connect(db_path)
    ensure_schema(conn)
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='people'")
    assert cur.fetchone() is not None

def test_schema_has_expected_columns(tmp_path):
    db_path = tmp_path / "test.db"
    conn = connect(db_path)
    ensure_schema(conn)
    cur = conn.execute("PRAGMA table_info(people)")
    cols = {row[1] for row in cur.fetchall()}
    expected = {
        "id", "full_name", "first_name", "last_name", "work_status",
        "start_date", "job", "work_email", "team", "reports_to",
        "office", "salary_amount", "salary_currency", "salary_type",
        "country", "city", "date_of_birth", "gender", "contract_type",
    }
    assert expected <= cols
