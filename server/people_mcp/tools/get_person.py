"""get_person tool: lookup by full_name or work_email, with manager + reports."""
from __future__ import annotations
import sqlite3
from people_mcp.errors import not_found, unknown_field


def get_person(
    conn: sqlite3.Connection,
    full_name: str | None = None,
    work_email: str | None = None,
) -> dict:
    if not full_name and not work_email:
        return unknown_field(field="(full_name|work_email)", valid=["full_name", "work_email"])

    if work_email:
        row = conn.execute("SELECT * FROM people WHERE work_email = ?", (work_email,)).fetchone()
    else:
        row = conn.execute("SELECT * FROM people WHERE full_name = ?", (full_name,)).fetchone()

    if not row:
        return not_found(
            entity="person",
            by="work_email" if work_email else "full_name",
            value=work_email or full_name,
        )

    person = dict(row)

    manager = None
    if person.get("reports_to"):
        m = conn.execute(
            "SELECT * FROM people WHERE full_name = ?", (person["reports_to"],)
        ).fetchone()
        if m:
            manager = {"full_name": m["full_name"], "job": m["job"], "team": m["team"]}

    reports_rows = conn.execute(
        "SELECT full_name, job, team FROM people WHERE reports_to = ? ORDER BY full_name",
        (person["full_name"],),
    ).fetchall()
    direct_reports = [dict(r) for r in reports_rows]

    return {"person": person, "manager": manager, "direct_reports": direct_reports}
