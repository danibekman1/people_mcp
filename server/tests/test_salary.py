import pytest
from people_mcp.salary import normalize_salary, load_fx_config


def test_load_fx_config_returns_expected_shape():
    cfg = load_fx_config()
    assert cfg["base"] == "USD"
    assert "USD" in cfg["rates"]
    assert "GBP" in cfg["rates"]
    assert "ILS" in cfg["rates"]
    assert cfg["months_per_year"] == 12
    assert cfg["hours_per_year"] == 2080


def test_normalize_yearly_usd_to_yearly_usd_is_identity():
    cfg = load_fx_config()
    assert normalize_salary(50000, "USD", "Yearly", "USD", "Yearly", cfg) == 50000.0


def test_normalize_monthly_to_yearly_multiplies_by_12():
    cfg = load_fx_config()
    assert normalize_salary(5000, "USD", "Monthly", "USD", "Yearly", cfg) == 60000.0


def test_normalize_gbp_yearly_to_usd_yearly_uses_rate():
    cfg = load_fx_config()  # rates["GBP"] = 1.27
    assert normalize_salary(80000, "GBP", "Yearly", "USD", "Yearly", cfg) == 80000 * 1.27


def test_normalize_yearly_to_monthly_divides_by_12():
    cfg = load_fx_config()
    assert normalize_salary(60000, "USD", "Yearly", "USD", "Monthly", cfg) == 5000.0


def test_normalize_hourly_to_yearly():
    cfg = load_fx_config()
    # 16 GBP/hour -> 16 * 2080 GBP/year -> * 1.27 USD
    expected = 16 * 2080 * 1.27
    assert normalize_salary(16, "GBP", "Hourly", "USD", "Yearly", cfg) == pytest.approx(expected)


def test_normalize_unknown_source_currency_raises():
    cfg = load_fx_config()
    with pytest.raises(ValueError):
        normalize_salary(10000, "EUR", "Yearly", "USD", "Yearly", cfg)


def test_normalize_unknown_source_frequency_raises():
    cfg = load_fx_config()
    with pytest.raises(ValueError):
        normalize_salary(10000, "USD", "Daily", "USD", "Yearly", cfg)
