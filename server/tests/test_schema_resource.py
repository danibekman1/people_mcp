from people_mcp.schema import build_schema_payload

def test_schema_includes_distinct_values(db):
    p = build_schema_payload(db)
    assert "Bread" in p["distinct_values"]["team"]
    assert "USD" in p["distinct_values"]["salary_currency"]
    assert p["row_count"] == 107
    assert p["fx_rates_as_of"] == "2026-04-01"

def test_schema_lists_columns(db):
    p = build_schema_payload(db)
    names = [c["name"] for c in p["columns"]]
    assert "full_name" in names
    assert "salary_amount" in names
