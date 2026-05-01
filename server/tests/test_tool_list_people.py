from people_mcp.tools.list_people import list_people

def test_list_all_no_filters_capped_at_default_limit(db):
    out = list_people(db, filters={}, sort_by=None, limit=None)
    assert out["count"] == 50  # default limit
    assert len(out["people"]) == 50

def test_list_all_with_high_limit_returns_full_dataset(db):
    out = list_people(db, filters={}, sort_by=None, limit=200)
    assert out["count"] == 107

def test_filter_by_team(db):
    out = list_people(db, filters={"team": "Bread"}, sort_by=None, limit=200)
    assert all(p["team"] == "Bread" for p in out["people"])
    assert out["count"] >= 1

def test_filter_by_city(db):
    out = list_people(db, filters={"city": "London"}, sort_by=None, limit=200)
    assert all(p["city"] == "London" for p in out["people"])

def test_filter_unknown_team_returns_structured_error(db):
    out = list_people(db, filters={"team": "Bakery"}, sort_by=None, limit=200)
    assert out.get("error") == "unknown_value"
    assert out["field"] == "team"
    assert "Bread" in out["valid"]

def test_job_contains_substring(db):
    out = list_people(db, filters={"job_contains": "Baker"}, sort_by=None, limit=200)
    assert all("Baker" in p["job"] for p in out["people"])

def test_hired_after_filter(db):
    out = list_people(db, filters={"hired_after": "2023-01-01"}, sort_by=None, limit=200)
    for p in out["people"]:
        assert p["start_date"] >= "2023-01-01"

def test_sort_by_salary_desc(db):
    out = list_people(db, filters={}, sort_by="salary desc", limit=10)
    salaries = [p["salary_amount"] for p in out["people"]]
    # NULLS LAST so all returned are non-null sorted desc
    assert all(s is not None for s in salaries)
    assert salaries == sorted(salaries, reverse=True)

def test_limit_max_enforced(db):
    out = list_people(db, filters={}, sort_by=None, limit=10000)
    assert len(out["people"]) <= 200

def test_unknown_filter_key_returns_unknown_field(db):
    out = list_people(db, filters={"made_up_key": "x"}, sort_by=None, limit=10)
    assert out["error"] == "unknown_field"

def test_invalid_date_returns_invalid_date(db):
    out = list_people(db, filters={"hired_after": "not-a-date"}, sort_by=None, limit=10)
    assert out["error"] == "invalid_date"
