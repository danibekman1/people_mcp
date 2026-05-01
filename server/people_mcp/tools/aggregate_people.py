"""aggregate_people tool: counts and salary aggregates with explicit normalization.

Salary metrics normalize each row to (target_currency, target_frequency) before
aggregating. Rows with null salary fields are skipped from salary metrics. The
fx_rates_as_of date is surfaced in the result so the LLM can disclose it.
"""
from __future__ import annotations
import sqlite3
from typing import Any

from people_mcp.errors import (
    unknown_value, unknown_currency, unknown_field, invalid_date, internal_error,
)
from people_mcp.salary import normalize_salary, load_fx_config

VALID_METRICS = ["count", "avg_salary", "sum_salary", "min_salary", "max_salary"]
VALID_GROUP_BY = ["team", "office", "city", "country", "job", "contract_type", "gender", "none"]
SALARY_METRICS = {"avg_salary", "sum_salary", "min_salary", "max_salary"}


def _validate_filter_value(conn: sqlite3.Connection, key: str, value: Any) -> dict | None:
    """Return None if valid, structured error dict if not. Mirrors list_people."""
    from people_mcp.tools.list_people import (
        EQUALITY_FILTERS, DATE_FILTERS, ALL_FILTER_KEYS, _distinct, _validate_date,
    )
    if key not in ALL_FILTER_KEYS:
        return unknown_field(field=key, valid=sorted(ALL_FILTER_KEYS))
    if key in EQUALITY_FILTERS:
        valid = _distinct(conn, EQUALITY_FILTERS[key])
        if value not in valid:
            return unknown_value(field=key, got=value, valid=valid)
    if key in DATE_FILTERS and not _validate_date(value):
        return invalid_date(field=key, got=value)
    return None


def _build_where(conn: sqlite3.Connection, filters: dict[str, Any]) -> tuple[str, list, dict | None]:
    """Returns (where_sql, params, error_or_none)."""
    from people_mcp.tools.list_people import EQUALITY_FILTERS, LIKE_FILTERS, DATE_FILTERS

    clauses, params = [], []
    for key, value in (filters or {}).items():
        if value is None:
            continue
        err = _validate_filter_value(conn, key, value)
        if err is not None:
            return "", [], err
        if key in EQUALITY_FILTERS:
            clauses.append(f"{EQUALITY_FILTERS[key]} = ?")
            params.append(value)
        elif key in LIKE_FILTERS:
            clauses.append(f"{LIKE_FILTERS[key]} LIKE ?")
            params.append(f"%{value}%")
        elif key in DATE_FILTERS:
            col, op = DATE_FILTERS[key]
            clauses.append(f"{col} {op} ?")
            params.append(value)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params, None


def aggregate_people(
    conn: sqlite3.Connection,
    metric: str,
    group_by: str = "none",
    filters: dict[str, Any] | None = None,
    target_currency: str = "USD",
    target_frequency: str = "Yearly",
) -> dict:
    cfg = load_fx_config()

    if metric not in VALID_METRICS:
        return unknown_value(field="metric", got=metric, valid=VALID_METRICS)
    if group_by not in VALID_GROUP_BY:
        return unknown_value(field="group_by", got=group_by, valid=VALID_GROUP_BY)
    if metric in SALARY_METRICS and target_currency not in cfg["rates"]:
        return unknown_currency(got=target_currency, valid=sorted(cfg["rates"]))
    if metric in SALARY_METRICS and target_frequency not in ("Yearly", "Monthly", "Hourly"):
        return unknown_value(
            field="target_frequency", got=target_frequency, valid=["Yearly", "Monthly", "Hourly"]
        )

    where_sql, params, err = _build_where(conn, filters or {})
    if err is not None:
        return err

    group_col = None if group_by == "none" else group_by
    if metric == "count":
        if group_col:
            sql = (
                f"SELECT {group_col} AS k, COUNT(*) AS n FROM people{where_sql} "
                f"GROUP BY {group_col} ORDER BY n DESC, k ASC"
            )
            rows = conn.execute(sql, params).fetchall()
            groups = [{"key": r["k"], "value": r["n"], "n": r["n"]} for r in rows]
        else:
            sql = f"SELECT COUNT(*) AS n FROM people{where_sql}"
            n = conn.execute(sql, params).fetchone()["n"]
            groups = [{"key": None, "value": n, "n": n}]
        return {
            "metric": metric,
            "group_by": group_by,
            "groups": groups,
        }

    # Salary metric: pull rows, normalize in Python (per-row currency may differ).
    select_cols = "salary_amount, salary_currency, salary_type"
    select_cols += f", {group_col} AS k" if group_col else ""
    # Skip rows where any salary field is null (incomplete records).
    null_skip = (
        " AND salary_amount IS NOT NULL AND salary_currency IS NOT NULL AND salary_type IS NOT NULL"
        if where_sql
        else " WHERE salary_amount IS NOT NULL AND salary_currency IS NOT NULL AND salary_type IS NOT NULL"
    )
    sql = f"SELECT {select_cols} FROM people{where_sql}{null_skip}"
    rows = conn.execute(sql, params).fetchall()

    buckets: dict[Any, list[float]] = {}
    for r in rows:
        try:
            v = normalize_salary(
                amount=float(r["salary_amount"]),
                from_currency=r["salary_currency"],
                from_frequency=r["salary_type"],
                to_currency=target_currency,
                to_frequency=target_frequency,
                cfg=cfg,
            )
        except ValueError as e:
            return internal_error(message=str(e))
        key = r["k"] if group_col else None
        buckets.setdefault(key, []).append(v)

    def reduce(values: list[float]) -> float:
        if metric == "avg_salary":
            return sum(values) / len(values) if values else 0.0
        if metric == "sum_salary":
            return sum(values)
        if metric == "min_salary":
            return min(values) if values else 0.0
        if metric == "max_salary":
            return max(values) if values else 0.0
        raise AssertionError(f"unhandled metric: {metric}")

    if not buckets:
        # No rows match the filter or all had null salary.
        groups = [{"key": None, "value": 0.0, "n": 0}] if not group_col else []
    else:
        groups = sorted(
            [{"key": k, "value": round(reduce(vs), 2), "n": len(vs)} for k, vs in buckets.items()],
            key=lambda g: (-g["value"], str(g["key"])),
        )
    return {
        "metric": metric,
        "group_by": group_by,
        "target_currency": target_currency,
        "target_frequency": target_frequency,
        "fx_rates_as_of": cfg["as_of"],
        "groups": groups,
    }
