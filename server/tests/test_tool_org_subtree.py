from people_mcp.tools.get_org_subtree import get_org_subtree

def test_subtree_from_named_root(db):
    out = get_org_subtree(db, root_name="Oryan Moshe")
    assert out["root"]["full_name"] == "Oryan Moshe"
    assert len(out["root"]["reports"]) >= 1

def test_subtree_full_org_when_root_omitted(db):
    out = get_org_subtree(db)
    assert "root" in out

def test_unknown_root_returns_error(db):
    out = get_org_subtree(db, root_name="Doesnt Exist")
    assert out["error"] == "not_found"

def test_max_depth_truncates(db):
    out = get_org_subtree(db, root_name="Oryan Moshe", max_depth=1)
    for r in out["root"]["reports"]:
        assert r.get("reports") == []

def test_cycle_detection(tmp_path):
    """Build a tiny DB with a cycle and verify graceful handling."""
    from people_mcp.db import connect, ensure_schema
    db_path = tmp_path / "cyc.db"
    conn = connect(db_path)
    ensure_schema(conn)
    rows = [
        ("Alice", "Alice", "X", "active", "2020-01-01", "CEO", "a@x.com", "T", "Bob",   "O", 1.0, "USD", "Yearly", "C", "Ci", "1980-01-01", None, "Full time"),
        ("Bob",   "Bob",   "Y", "active", "2020-01-01", "CTO", "b@x.com", "T", "Alice", "O", 1.0, "USD", "Yearly", "C", "Ci", "1980-01-01", None, "Full time"),
    ]
    conn.executemany(
        """INSERT INTO people (full_name, first_name, last_name, work_status, start_date, job, work_email, team, reports_to, office, salary_amount, salary_currency, salary_type, country, city, date_of_birth, gender, contract_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    conn.commit()
    out = get_org_subtree(conn, root_name="Alice", max_depth=10)
    assert "warnings" in out
    assert any("cycle" in w for w in out["warnings"])
