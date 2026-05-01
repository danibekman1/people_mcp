from pathlib import Path
import pytest
from people_mcp.db import connect, ensure_schema
from people_mcp.ingest import parse_date, parse_currency, ingest_csv

CSV = Path(__file__).parent.parent / "data" / "people-list-export.csv"


def test_parse_date_dd_mm_yyyy():
    assert parse_date("03/06/2023") == "2023-06-03"
    assert parse_date("28/01/1977") == "1977-01-28"

def test_parse_date_invalid_raises():
    with pytest.raises(ValueError):
        parse_date("2023-06-03")  # ISO is not the input format

def test_parse_currency_strips_symbol():
    assert parse_currency("USD $") == "USD"
    assert parse_currency("GBP £") == "GBP"
    assert parse_currency("ILS ₪") == "ILS"
    assert parse_currency("USD") == "USD"

def test_parse_currency_empty_returns_none():
    assert parse_currency("") is None
    assert parse_currency("   ") is None

def test_ingest_loads_full_csv(tmp_path):
    db_path = tmp_path / "test.db"
    conn = connect(db_path)
    ensure_schema(conn)
    n = ingest_csv(conn, CSV)
    assert n == 107
    cur = conn.execute("SELECT COUNT(*) FROM people")
    assert cur.fetchone()[0] == 107

def test_ingest_handles_known_row(tmp_path):
    db_path = tmp_path / "test.db"
    conn = connect(db_path)
    ensure_schema(conn)
    ingest_csv(conn, CSV)
    row = conn.execute(
        "SELECT * FROM people WHERE work_email = ?",
        ("alaric.finch-sallow@crumbandculture.com",),
    ).fetchone()
    assert row is not None
    assert row["full_name"] == "Alaric Finch-Sallow"
    assert row["start_date"] == "2023-06-03"
    assert row["salary_currency"] == "USD"
    assert row["salary_amount"] == 88000.0
    assert row["salary_type"] == "Yearly"

def test_ingest_handles_pending_arrival_row(tmp_path):
    """Oryan Moshe is 'pending_arrival' with mostly empty fields. Must still ingest."""
    db_path = tmp_path / "test.db"
    conn = connect(db_path)
    ensure_schema(conn)
    ingest_csv(conn, CSV)
    row = conn.execute(
        "SELECT * FROM people WHERE full_name = ?", ("Oryan Moshe",)
    ).fetchone()
    assert row is not None
    assert row["work_status"] == "pending_arrival"
    assert row["salary_amount"] is None
    assert row["start_date"] is None
