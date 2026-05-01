"""FastMCP server entry point.

Streamable HTTP transport at /mcp.
Ingests CSV at startup; tools come online once the DB is ready.
"""
from __future__ import annotations
import logging
import os
from pathlib import Path

from fastmcp import FastMCP
from people_mcp.db import connect, ensure_schema
from people_mcp.ingest import ingest_csv

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
def hello() -> dict:
    """Smoke-test tool. Returns server identity. Removed once real tools land."""
    return {"server": "people-mcp", "ok": True}


def main() -> None:
    _bootstrap()
    # Streamable HTTP at /mcp on 0.0.0.0:8000
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000, path="/mcp")


if __name__ == "__main__":
    main()
