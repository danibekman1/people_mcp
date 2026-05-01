import pytest
from pathlib import Path
from people_mcp.db import connect, ensure_schema
from people_mcp.ingest import ingest_csv

CSV = Path(__file__).parent.parent / "data" / "people-list-export.csv"


@pytest.fixture
def db(tmp_path):
    db_path = tmp_path / "people.db"
    conn = connect(db_path)
    ensure_schema(conn)
    ingest_csv(conn, CSV)
    yield conn
    conn.close()
