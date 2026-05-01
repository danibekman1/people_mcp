"""list_people tool: filtered listing with sort + limit.

Filter values are validated against the actual distinct values in the DB so
the LLM gets a structured 'valid options' error and self-corrects.
"""
from __future__ import annotations
import re
import sqlite3
from typing import Any
from people_mcp.errors import unknown_value, unknown_field, invalid_date

DEFAULT_LIMIT = 50
MAX_LIMIT = 200

# Filters that match an exact column, with the column they map to.
EQUALITY_FILTERS = {
    "team": "team",
    "office": "office",
    "city": "city",
    "country": "country",
    "contract_type": "contract_type",
    "work_status": "work_status",
    "gender": "gender",
}

# Substring filters.
LIKE_FILTERS = {
    "job_contains": "job",
    "name_contains": "full_name",
}

# Date range filters.
DATE_FILTERS = {
    "hired_after": ("start_date", ">="),
    "hired_before": ("start_date", "<="),
}

ALL_FILTER_KEYS = set(EQUALITY_FILTERS) | set(LIKE_FILTERS) | set(DATE_FILTERS)

SORTABLE = {
    "salary": "salary_amount",
    "start_date": "start_date",
    "name": "full_name",
    "tenure": "start_date",  # tenure desc <=> start_date asc
}


def _distinct(conn: sqlite3.Connection, column: str) -> list[str]:
    cur = conn.execute(
        f"SELECT DISTINCT {column} FROM people WHERE {column} IS NOT NULL ORDER BY {column}"
    )
    return [r[0] for r in cur.fetchall()]


def _validate_date(s: str) -> bool:
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", s))


def list_people(
    conn: sqlite3.Connection,
    filters: dict[str, Any] | None = None,
    sort_by: str | None = None,
    limit: int | None = None,
) -> dict:
    filters = filters or {}

    # Validate filter keys.
    for key in filters:
        if key not in ALL_FILTER_KEYS:
            return unknown_field(field=key, valid=sorted(ALL_FILTER_KEYS))

    where_clauses: list[str] = []
    params: list[Any] = []

    # Equality filters with valid-value enforcement.
    for key, column in EQUALITY_FILTERS.items():
        if key not in filters or filters[key] is None:
            continue
        value = filters[key]
        valid = _distinct(conn, column)
        if value not in valid:
            return unknown_value(field=key, got=value, valid=valid)
        where_clauses.append(f"{column} = ?")
        params.append(value)

    # LIKE filters (no validation; substring is LLM intent).
    for key, column in LIKE_FILTERS.items():
        if key not in filters or filters[key] is None:
            continue
        where_clauses.append(f"{column} LIKE ?")
        params.append(f"%{filters[key]}%")

    # Date filters.
    for key, (column, op) in DATE_FILTERS.items():
        if key not in filters or filters[key] is None:
            continue
        value = filters[key]
        if not _validate_date(value):
            return invalid_date(field=key, got=value)
        where_clauses.append(f"{column} {op} ?")
        params.append(value)

    sql = "SELECT * FROM people"
    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)

    # Sort.
    if sort_by:
        parts = sort_by.strip().split()
        col_alias = parts[0]
        direction = parts[1].upper() if len(parts) > 1 else "ASC"
        if col_alias not in SORTABLE:
            return unknown_value(field="sort_by", got=col_alias, valid=sorted(SORTABLE))
        if direction not in ("ASC", "DESC"):
            return unknown_value(field="sort_by_direction", got=direction, valid=["asc", "desc"])
        # Special: "tenure desc" -> start_date ASC (longer tenure = older start).
        if col_alias == "tenure":
            direction = "ASC" if direction == "DESC" else "DESC"
        sort_col = SORTABLE[col_alias]
        # Push NULLs to the end so e.g. 'salary desc' returns real salaries first.
        sql += f" ORDER BY ({sort_col} IS NULL), {sort_col} {direction}"

    # Limit.
    actual_limit = limit if limit is not None else DEFAULT_LIMIT
    actual_limit = max(1, min(actual_limit, MAX_LIMIT))
    sql += " LIMIT ?"
    params.append(actual_limit)

    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    return {"count": len(rows), "people": rows}
