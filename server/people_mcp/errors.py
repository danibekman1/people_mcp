"""Structured tool error builders. See design doc §5.4."""
from __future__ import annotations
from typing import Any


def unknown_value(field: str, got: Any, valid: list[str]) -> dict:
    return {"error": "unknown_value", "field": field, "got": got, "valid": valid}


def unknown_field(field: str, valid: list[str]) -> dict:
    return {"error": "unknown_field", "field": field, "valid": valid}


def invalid_date(field: str, got: Any, expected_format: str = "YYYY-MM-DD") -> dict:
    return {"error": "invalid_date", "field": field, "got": got, "expected_format": expected_format}


def unknown_currency(got: Any, valid: list[str]) -> dict:
    return {"error": "unknown_currency", "got": got, "valid": valid}


def not_found(entity: str, by: str, value: Any) -> dict:
    return {"error": "not_found", "entity": entity, "by": by, "value": value}


def ambiguous_match(entity: str, value: Any, candidates: list[str]) -> dict:
    return {"error": "ambiguous_match", "entity": entity, "value": value, "candidates": candidates}


def internal_error(message: str) -> dict:
    return {"error": "internal_error", "message": message}
