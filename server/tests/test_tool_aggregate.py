from people_mcp.tools.aggregate_people import aggregate_people


def test_count_total(db):
    out = aggregate_people(db, metric="count", group_by="none")
    assert out["groups"] == [{"key": None, "value": 107, "n": 107}]


def test_count_by_team(db):
    out = aggregate_people(db, metric="count", group_by="team")
    teams = {g["key"]: g["value"] for g in out["groups"]}
    assert "Bread" in teams
    assert teams["Bread"] >= 1


def test_count_with_filter_team_bread(db):
    out = aggregate_people(db, metric="count", group_by="none", filters={"team": "Bread"})
    assert out["groups"][0]["value"] >= 1
    assert out["groups"][0]["value"] < 107


def test_avg_salary_returns_usd_yearly_by_default(db):
    out = aggregate_people(db, metric="avg_salary", group_by="none")
    assert out["target_currency"] == "USD"
    assert out["target_frequency"] == "Yearly"
    assert out["groups"][0]["value"] > 0
    assert out["fx_rates_as_of"] == "2026-04-01"


def test_avg_salary_grouped_by_team(db):
    out = aggregate_people(db, metric="avg_salary", group_by="team")
    assert any(g["key"] == "Bread" for g in out["groups"])


def test_unknown_metric_returns_error(db):
    out = aggregate_people(db, metric="median_salary", group_by="none")
    assert out["error"] == "unknown_value"


def test_target_currency_eur_returns_error(db):
    out = aggregate_people(db, metric="avg_salary", group_by="none", target_currency="EUR")
    assert out["error"] == "unknown_currency"


def test_salary_metric_skips_rows_with_null_salary(db):
    """The pending_arrival row has no salary; aggregate must not crash and 'n' must reflect skipped rows."""
    out = aggregate_people(db, metric="avg_salary", group_by="none")
    # 107 total, but at least one (Oryan Moshe) has null salary.
    assert out["groups"][0]["n"] < 107
