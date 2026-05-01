"""Multi-currency salary normalization.

All conversions go through the base currency (USD). The two FX dimensions:
1. Currency: amount * rates[from] / rates[to] (rates are 'X to base').
2. Frequency: Yearly <-> Monthly via months_per_year, Hourly via hours_per_year.
"""
from __future__ import annotations
from functools import lru_cache
from pathlib import Path
import yaml

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "fx_rates.yaml"

VALID_FREQUENCIES = ("Yearly", "Monthly", "Hourly")


@lru_cache(maxsize=1)
def load_fx_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def _to_yearly(amount_in_freq: float, frequency: str, cfg: dict) -> float:
    if frequency == "Yearly":
        return amount_in_freq
    if frequency == "Monthly":
        return amount_in_freq * cfg["months_per_year"]
    if frequency == "Hourly":
        return amount_in_freq * cfg["hours_per_year"]
    raise ValueError(f"unknown frequency: {frequency}")


def _from_yearly(yearly_amount: float, frequency: str, cfg: dict) -> float:
    if frequency == "Yearly":
        return yearly_amount
    if frequency == "Monthly":
        return yearly_amount / cfg["months_per_year"]
    if frequency == "Hourly":
        return yearly_amount / cfg["hours_per_year"]
    raise ValueError(f"unknown frequency: {frequency}")


def normalize_salary(
    amount: float,
    from_currency: str,
    from_frequency: str,
    to_currency: str,
    to_frequency: str,
    cfg: dict | None = None,
) -> float:
    cfg = cfg or load_fx_config()
    rates = cfg["rates"]

    if from_currency not in rates:
        raise ValueError(f"unknown source currency: {from_currency}")
    if to_currency not in rates:
        raise ValueError(f"unknown target currency: {to_currency}")
    if from_frequency not in VALID_FREQUENCIES:
        raise ValueError(f"unknown source frequency: {from_frequency}")
    if to_frequency not in VALID_FREQUENCIES:
        raise ValueError(f"unknown target frequency: {to_frequency}")

    # Step 1: convert amount to base currency (USD).
    in_base = amount * rates[from_currency]

    # Step 2: convert to canonical Yearly frequency in base currency.
    yearly_in_base = _to_yearly(in_base, from_frequency, cfg)

    # Step 3: convert from base to target currency (still yearly).
    yearly_in_target = yearly_in_base / rates[to_currency]

    # Step 4: convert to target frequency.
    return _from_yearly(yearly_in_target, to_frequency, cfg)
