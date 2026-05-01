"""MCP prompt primitives.

Prompts are reusable, parameterized templates that an MCP host (Claude
Code, Claude Desktop, this chat UI) can offer to a user. They encode
common analytical workflows so the user doesn't have to retype them, and
they constrain the agent to the same shape of answer each time.

The model doesn't read these directly. The host renders the template
and submits it as the user's next message; the agent then handles it
via the tool surface. So good prompts are short, opinionated, and
reference the right tools by name.

These are intentionally narrow - one summary, one snapshot - to keep the
'available prompts' menu legible.
"""
from __future__ import annotations


def team_summary(team_name: str) -> str:
    """Render a 'tell me about this team' workflow."""
    return (
        f"Give me a structured summary of the {team_name} team using the "
        "MCP tools.\n\n"
        "Cover, in this order:\n"
        f"1. Headcount (call aggregate_people with metric=count, "
        f"filters.team={team_name!r}).\n"
        "2. Salary range in USD per year - min, average, and max. Use "
        "aggregate_people with the salary metrics; mention the FX rates "
        "as_of date in your final answer.\n"
        f"3. Top 3 most common job titles in {team_name} (sample via "
        "list_people sorted by start_date and group by job in your prose).\n"
        "4. Longest-tenured person on the team (list_people with "
        "sort_by='tenure desc', limit=1).\n\n"
        "Format as markdown with bold section headers. Be concise."
    )


def org_overview() -> str:
    """Render a 'company-wide HR snapshot' workflow."""
    return (
        "Produce a company-wide HR snapshot using the MCP tools.\n\n"
        "Sections, in this order:\n"
        "1. Total headcount and a 1-line cultural framing.\n"
        "2. Headcount by team (aggregate_people, metric=count, "
        "group_by=team) - render as a markdown table sorted descending.\n"
        "3. Headcount by office (aggregate_people, metric=count, "
        "group_by=office) - markdown table.\n"
        "4. Company-wide average salary in USD per year "
        "(aggregate_people, metric=avg_salary, target_currency=USD, "
        "target_frequency=Yearly). Disclose fx_rates_as_of.\n"
        "5. Top 5 longest-tenured employees (list_people, "
        "sort_by='tenure desc', limit=5) - name, job, team, start date.\n\n"
        "Be concise. Use markdown tables for the lists. Don't editorialize "
        "beyond the 1-line cultural framing."
    )


# Single source of truth for what the server exposes - tested directly,
# wired into server.py via @mcp.prompt() decorators.
PROMPT_REGISTRY = {
    "team_summary": team_summary,
    "org_overview": org_overview,
}
