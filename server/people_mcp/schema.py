"""people://schema resource: column metadata + distinct low-cardinality values."""
from __future__ import annotations
import sqlite3
from people_mcp.salary import load_fx_config

LOW_CARDINALITY_COLS = [
    "team", "office", "country", "city",
    "contract_type", "salary_currency", "salary_type",
    "work_status", "gender",
]


def build_schema_payload(conn: sqlite3.Connection) -> dict:
    cur = conn.execute("PRAGMA table_info(people)")
    cols = [
        {"name": r[1], "type": r[2], "nullable": not r[3]}
        for r in cur.fetchall() if r[1] != "id"
    ]

    distinct: dict[str, list] = {}
    for c in LOW_CARDINALITY_COLS:
        rows = conn.execute(
            f"SELECT DISTINCT {c} FROM people WHERE {c} IS NOT NULL ORDER BY {c}"
        ).fetchall()
        distinct[c] = [r[0] for r in rows]

    n = conn.execute("SELECT COUNT(*) FROM people").fetchone()[0]
    cfg = load_fx_config()

    return {
        "columns": cols,
        "distinct_values": distinct,
        "row_count": n,
        "fx_rates_as_of": cfg["as_of"],
    }
