"""FastMCP server entry point.

Streamable HTTP transport at /mcp.
Ingests CSV at startup; tools come online once the DB is ready.
"""
from __future__ import annotations
import logging
from pathlib import Path

from fastmcp import FastMCP
from people_mcp.db import connect, ensure_schema
from people_mcp.ingest import ingest_csv
from people_mcp.tools.list_people import list_people as _list_people
from people_mcp.tools.aggregate_people import aggregate_people as _aggregate_people
from people_mcp.tools.get_person import get_person as _get_person
from people_mcp.tools.get_org_subtree import get_org_subtree as _get_org_subtree
from people_mcp.schema import build_schema_payload
from people_mcp.prompts import team_summary as _team_summary, org_overview as _org_overview

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "people.db"
CSV_PATH = ROOT / "data" / "people-list-export.csv"

mcp = FastMCP("people-mcp")


def _bootstrap() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(DB_PATH)
    ensure_schema(conn)
    n = ingest_csv(conn, CSV_PATH)
    log.info("ingest complete: %d people", n)


def get_conn():
    """Per-call connection (sqlite3 connections are not thread-safe by default)."""
    return connect(DB_PATH)


@mcp.tool()
def list_people(
    filters: dict | None = None,
    sort_by: str | None = None,
    limit: int | None = None,
) -> dict:
    """List people matching filters.

    Filters:
      - team, office, city, country, contract_type, work_status, gender:
        exact match against valid values from the people://schema resource.
      - job_contains, name_contains: substring match.
      - hired_after, hired_before: ISO date YYYY-MM-DD.

    sort_by: '<key> <asc|desc>' where key is salary, start_date, name, or tenure.
    limit: default 50, max 200.

    On invalid filter values the response includes
    {"error": "unknown_value", "valid": [...]} - retry with one of those values.
    """
    with get_conn() as conn:
        return _list_people(conn, filters=filters, sort_by=sort_by, limit=limit)


@mcp.tool()
def aggregate_people(
    metric: str,
    group_by: str = "none",
    filters: dict | None = None,
    target_currency: str = "USD",
    target_frequency: str = "Yearly",
) -> dict:
    """Aggregate people by metric and group.

    metric: count | avg_salary | sum_salary | min_salary | max_salary
    group_by: team | office | city | country | job | contract_type | gender | none

    For salary metrics, target_currency (USD|GBP|ILS) and target_frequency
    (Yearly|Monthly|Hourly) control normalization. FX rates are static; the
    'fx_rates_as_of' field is included in the response. Use this for any
    'how many' or numeric-summary question.
    """
    with get_conn() as conn:
        return _aggregate_people(
            conn,
            metric=metric,
            group_by=group_by,
            filters=filters,
            target_currency=target_currency,
            target_frequency=target_frequency,
        )


@mcp.tool()
def get_person(full_name: str | None = None, work_email: str | None = None) -> dict:
    """Look up a single person by full_name or work_email.

    Returns the person plus their manager (if any) and direct reports. Use
    for 'tell me about X' or 'who is X's manager' questions.
    """
    with get_conn() as conn:
        return _get_person(conn, full_name=full_name, work_email=work_email)


@mcp.tool()
def get_org_subtree(root_name: str | None = None, max_depth: int | None = None) -> dict:
    """Reporting hierarchy as a nested tree.

    Omit root_name for the full org. Returns
    {root: {full_name, job, team, reports: [...]}}. Includes a 'warnings'
    field if a cycle was detected in the reports_to chain.
    """
    with get_conn() as conn:
        return _get_org_subtree(conn, root_name=root_name, max_depth=max_depth)


@mcp.resource("people://schema")
def schema_resource() -> dict:
    """Schema and distinct values for the people dataset.

    Read this once on startup so you know the valid filter values
    (team names, office names, etc.) before calling list_people or
    aggregate_people.
    """
    with get_conn() as conn:
        return build_schema_payload(conn)


@mcp.prompt()
def team_summary(team_name: str) -> str:
    """Reusable workflow: summarize a single team (headcount, salary band,
    common roles, longest tenure). The host renders this template; the
    agent then drives it via aggregate_people and list_people.
    """
    return _team_summary(team_name)


@mcp.prompt()
def org_overview() -> str:
    """Reusable workflow: company-wide HR snapshot (totals, breakdowns by
    team and office, average salary in USD/year, top tenure). Driven by
    aggregate_people and list_people; FX rates are disclosed via the
    fx_rates_as_of field.
    """
    return _org_overview()


def main() -> None:
    _bootstrap()
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000, path="/mcp")


if __name__ == "__main__":
    main()
