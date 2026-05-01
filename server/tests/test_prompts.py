"""Tests for the MCP prompt templates.

These cover argument substitution and the references to tool names that
the agent will look for. We don't run the prompts through Claude here -
the eval suite covers end-to-end behavior. These tests just lock the
prompt text against accidental edits.
"""
from people_mcp.prompts import PROMPT_REGISTRY, org_overview, team_summary


def test_team_summary_substitutes_team_name():
    out = team_summary("Bread")
    assert "Bread" in out
    # Used twice: once in the framing, once in the tool-call hint.
    assert out.count("Bread") >= 2


def test_team_summary_references_required_tools():
    out = team_summary("Marketing")
    assert "aggregate_people" in out
    assert "list_people" in out


def test_team_summary_mentions_fx_disclosure():
    out = team_summary("Bread")
    assert "as_of" in out


def test_org_overview_references_required_tools():
    out = org_overview()
    assert "aggregate_people" in out
    assert "list_people" in out


def test_org_overview_pins_currency_and_frequency():
    out = org_overview()
    assert "USD" in out
    assert "Yearly" in out


def test_registry_exposes_both_prompts():
    assert set(PROMPT_REGISTRY.keys()) == {"team_summary", "org_overview"}


def test_registry_callables_render_strings():
    assert isinstance(PROMPT_REGISTRY["team_summary"]("Pastry"), str)
    assert isinstance(PROMPT_REGISTRY["org_overview"](), str)
