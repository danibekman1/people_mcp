from people_mcp.tools.get_person import get_person

def test_get_by_full_name(db):
    out = get_person(db, full_name="Alaric Finch-Sallow")
    assert out["person"]["full_name"] == "Alaric Finch-Sallow"
    assert out["person"]["work_email"] == "alaric.finch-sallow@crumbandculture.com"

def test_get_by_email(db):
    out = get_person(db, work_email="alistair.finch@crumbandculture.com")
    assert out["person"]["full_name"] == "Alistair Finch"

def test_returns_manager(db):
    out = get_person(db, full_name="Alaric Finch-Sallow")
    assert out["manager"] is not None
    assert out["manager"]["full_name"] == "Oryan Moshe"

def test_returns_direct_reports_for_manager(db):
    out = get_person(db, full_name="Oryan Moshe")
    names = [r["full_name"] for r in out["direct_reports"]]
    assert "Alaric Finch-Sallow" in names

def test_not_found_returns_structured_error(db):
    out = get_person(db, full_name="Doesnt Exist")
    assert out["error"] == "not_found"

def test_no_args_returns_error(db):
    out = get_person(db)
    assert out["error"] in {"unknown_field", "not_found"}
