"""get_org_subtree tool: nested reporting hierarchy with cycle detection."""
from __future__ import annotations
import sqlite3
from people_mcp.errors import not_found

DEFAULT_MAX_DEPTH = 5


def _node(row) -> dict:
    return {
        "full_name": row["full_name"],
        "job": row["job"],
        "team": row["team"],
        "reports": [],
    }


def _build(
    conn: sqlite3.Connection,
    name: str,
    depth: int,
    max_depth: int,
    visited: set,
    warnings: list,
) -> dict | None:
    if name in visited:
        warnings.append(f"cycle detected at: {name}")
        return None
    row = conn.execute(
        "SELECT full_name, job, team FROM people WHERE full_name = ?", (name,)
    ).fetchone()
    if not row:
        return None
    node = _node(row)
    if depth >= max_depth:
        return node
    visited.add(name)
    reports = conn.execute(
        "SELECT full_name FROM people WHERE reports_to = ? ORDER BY full_name", (name,)
    ).fetchall()
    for r in reports:
        child = _build(conn, r["full_name"], depth + 1, max_depth, visited, warnings)
        if child is not None:
            node["reports"].append(child)
    visited.remove(name)
    return node


def get_org_subtree(
    conn: sqlite3.Connection,
    root_name: str | None = None,
    max_depth: int | None = None,
) -> dict:
    max_depth = max_depth if max_depth is not None else DEFAULT_MAX_DEPTH
    warnings: list[str] = []

    if root_name is None:
        # Pick the (alphabetically first) person with no manager as the canonical root.
        row = conn.execute(
            "SELECT full_name FROM people WHERE reports_to IS NULL ORDER BY full_name LIMIT 1"
        ).fetchone()
        if not row:
            return {"error": "internal_error", "message": "no root found in org"}
        root_name = row["full_name"]

    if not conn.execute("SELECT 1 FROM people WHERE full_name = ?", (root_name,)).fetchone():
        return not_found(entity="person", by="full_name", value=root_name)

    tree = _build(conn, root_name, depth=0, max_depth=max_depth, visited=set(), warnings=warnings)
    out: dict = {"root": tree}
    if warnings:
        out["warnings"] = warnings
    return out
