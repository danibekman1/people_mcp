"""End-to-end eval harness for the MCP chat stack.

Runs each YAML case against a live `/api/chat` endpoint, consumes the SSE
stream, and asserts the agent's tool-use trace and final answer match
expectations. Prints a pass/fail table and exits non-zero on any failure.

Usage:
    cd server && uv run python -m eval.run_eval
    # optional overrides:
    EVAL_CHAT_URL=http://localhost:3000/api/chat \\
    EVAL_CASES=server/eval/cases.yaml \\
    EVAL_TIMEOUT=120 \\
        uv run python -m eval.run_eval
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import yaml


CHAT_URL = os.environ.get("EVAL_CHAT_URL", "http://localhost:3000/api/chat")
CASES_PATH = Path(os.environ.get("EVAL_CASES", str(Path(__file__).parent / "cases.yaml")))
TIMEOUT = float(os.environ.get("EVAL_TIMEOUT", "180"))


@dataclass
class Trace:
    """Structured view of an SSE chat turn."""

    text: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    tool_results: list[dict[str, Any]] = field(default_factory=list)
    done: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)
    cancelled: bool = False
    conversation_id: str | None = None
    raw_events: list[dict[str, Any]] = field(default_factory=list)


def stream_chat(question: str, conversation_id: str | None = None) -> Trace:
    """POST a question to /api/chat and collect the SSE stream into a Trace.

    Pass conversation_id to continue an existing conversation; the backend
    will load prior history from chat.db. Pass None for a fresh thread.
    """
    trace = Trace()
    payload: dict[str, Any] = {"message": question}
    if conversation_id:
        payload["conversation_id"] = conversation_id
    with httpx.stream(
        "POST",
        CHAT_URL,
        json=payload,
        timeout=httpx.Timeout(TIMEOUT, connect=10.0),
        headers={"Accept": "text/event-stream"},
    ) as resp:
        if resp.status_code != 200:
            trace.errors.append(f"HTTP {resp.status_code}: {resp.read().decode('utf-8', 'replace')}")
            return trace
        # Each SSE event is one or more `data: ...` lines terminated by a blank line.
        # Our backend emits one JSON payload per event on a single data line.
        for line in resp.iter_lines():
            if not line or not line.startswith("data:"):
                continue
            data = line[len("data:") :].lstrip()
            try:
                event = json.loads(data)
            except json.JSONDecodeError:
                continue
            trace.raw_events.append(event)
            etype = event.get("type")
            if etype == "text":
                trace.text += event.get("delta", "")
            elif etype == "tool_call":
                trace.tool_calls.append(event)
            elif etype == "tool_result":
                trace.tool_results.append(event)
            elif etype == "done":
                trace.done = event
                trace.conversation_id = event.get("conversation_id")
            elif etype == "error":
                trace.errors.append(str(event.get("message", "")))
                trace.conversation_id = trace.conversation_id or event.get("conversation_id")
            elif etype == "cancelled":
                trace.cancelled = True
                trace.conversation_id = trace.conversation_id or event.get("conversation_id")
    return trace


def _is_subset(expected: Any, actual: Any) -> bool:
    """Recursive deep-subset check.

    Conventions:
    - dicts: every key in `expected` must exist in `actual` and recurse.
    - the special wrapper `{"any_of": [...]}` matches if `actual` equals any
      listed value (for use when the LLM legitimately has multiple acceptable
      answers, e.g. fanning out across ambiguous matches).
    - everything else: equality.
    """
    if isinstance(expected, dict):
        if set(expected.keys()) == {"any_of"} and isinstance(expected["any_of"], list):
            return any(_is_subset(opt, actual) for opt in expected["any_of"])
        if not isinstance(actual, dict):
            return False
        return all(k in actual and _is_subset(v, actual[k]) for k, v in expected.items())
    return expected == actual


def _first_tool_call(trace: Trace, names: set[str]) -> dict[str, Any] | None:
    for tc in trace.tool_calls:
        if tc.get("name") in names:
            return tc
    return None


def _tool_call_names(trace: Trace) -> list[str]:
    return [tc.get("name", "?") for tc in trace.tool_calls]


def _check_must_call_tool(case: dict, trace: Trace, failures: list[str]) -> None:
    expected = case.get("must_call_tool")
    if expected is None:
        return
    allowed = {expected} if isinstance(expected, str) else set(expected)
    called = set(_tool_call_names(trace))
    if not allowed & called:
        failures.append(
            f"must_call_tool: expected one of {sorted(allowed)}, "
            f"got {_tool_call_names(trace) or '<none>'}"
        )


def _check_with_args_subset(case: dict, trace: Trace, failures: list[str]) -> None:
    expected = case.get("with_args_subset")
    if not expected:
        return
    must_call = case.get("must_call_tool")
    allowed = (
        {must_call} if isinstance(must_call, str)
        else set(must_call) if must_call
        else {tc["name"] for tc in trace.tool_calls}
    )
    tc = _first_tool_call(trace, allowed)
    if tc is None:
        failures.append(f"with_args_subset: no tool call to {sorted(allowed)} to match against")
        return
    if not _is_subset(expected, tc.get("input", {})):
        failures.append(
            f"with_args_subset: expected {expected} <= {tc.get('input')} (tool={tc.get('name')})"
        )


def _check_finally_calls_tool_with_args(case: dict, trace: Trace, failures: list[str]) -> None:
    expected = case.get("finally_calls_tool_with_args")
    if not expected:
        return
    if not trace.tool_calls:
        failures.append("finally_calls_tool_with_args: no tool calls observed")
        return
    last = trace.tool_calls[-1]
    if not _is_subset(expected, last.get("input", {})):
        failures.append(
            f"finally_calls_tool_with_args: expected {expected} <= "
            f"{last.get('input')} (last tool={last.get('name')})"
        )


def _check_answer_contains(case: dict, trace: Trace, failures: list[str]) -> None:
    text = trace.text.lower()
    for needle in case.get("answer_contains", []) or []:
        if needle.lower() not in text:
            failures.append(f"answer_contains: missing {needle!r}")
    any_of = case.get("answer_contains_any") or []
    if any_of and not any(n.lower() in text for n in any_of):
        failures.append(f"answer_contains_any: none of {any_of} present")
    for needle in case.get("must_not_contain", []) or []:
        if needle.lower() in text:
            failures.append(f"must_not_contain: found forbidden {needle!r}")


def _check_error_recovery(case: dict, trace: Trace, failures: list[str]) -> None:
    if not case.get("expects_error_recovery"):
        return
    # Find first errored tool_result, then require at least one subsequent tool_call.
    error_idx = next(
        (i for i, ev in enumerate(trace.raw_events)
         if ev.get("type") == "tool_result" and isinstance(ev.get("result"), dict)
         and ev["result"].get("error")),
        None,
    )
    if error_idx is None:
        failures.append("expects_error_recovery: no errored tool_result observed")
        return
    later_call = any(
        ev.get("type") == "tool_call" for ev in trace.raw_events[error_idx + 1:]
    )
    if not later_call:
        failures.append("expects_error_recovery: error observed but no follow-up tool_call")


def _run_assertions(turn_or_case: dict, trace: Trace, failures: list[str]) -> None:
    if trace.errors:
        failures.append(f"server emitted error event(s): {trace.errors}")
    if trace.cancelled:
        failures.append("turn was cancelled")
    if trace.done is None and not trace.cancelled and not trace.errors:
        failures.append("stream ended without a done event")
    _check_must_call_tool(turn_or_case, trace, failures)
    _check_with_args_subset(turn_or_case, trace, failures)
    _check_finally_calls_tool_with_args(turn_or_case, trace, failures)
    _check_answer_contains(turn_or_case, trace, failures)
    _check_error_recovery(turn_or_case, trace, failures)


def evaluate_single_turn_case(case: dict) -> tuple[bool, list[str], Trace, float]:
    name = case["name"]
    question = case["question"]
    print(f"  -> {name}: {question!r}", flush=True)
    t0 = time.time()
    try:
        trace = stream_chat(question)
    except Exception as exc:  # network/SSE failures shouldn't crash the run
        return False, [f"stream error: {exc!r}"], Trace(), time.time() - t0
    elapsed = time.time() - t0

    failures: list[str] = []
    _run_assertions(case, trace, failures)

    return not failures, failures, trace, elapsed


def evaluate_multi_turn_case(case: dict) -> tuple[bool, list[str], Trace, float]:
    """Run a multi-turn case, threading conversation_id between turns.

    Per-turn assertions run against that turn's trace; on any turn failing,
    the run continues so the operator gets a full report. The aggregate
    Trace returned has tool_calls and text concatenated across turns so the
    summary table shows everything that happened.
    """
    name = case["name"]
    turns = case["turns"]
    print(f"  -> {name} ({len(turns)} turns)", flush=True)
    t0 = time.time()

    failures: list[str] = []
    aggregate = Trace()
    conv_id: str | None = None

    for i, turn in enumerate(turns, start=1):
        question = turn["question"]
        print(f"     turn {i}: {question!r}", flush=True)
        try:
            trace = stream_chat(question, conversation_id=conv_id)
        except Exception as exc:
            failures.append(f"turn {i}: stream error: {exc!r}")
            return False, failures, aggregate, time.time() - t0

        turn_failures: list[str] = []
        _run_assertions(turn, trace, turn_failures)
        for tf in turn_failures:
            failures.append(f"turn {i}: {tf}")

        aggregate.text += ("\n" if aggregate.text else "") + trace.text
        aggregate.tool_calls.extend(trace.tool_calls)
        aggregate.tool_results.extend(trace.tool_results)
        aggregate.raw_events.extend(trace.raw_events)
        aggregate.errors.extend(trace.errors)
        if trace.cancelled:
            aggregate.cancelled = True
        aggregate.done = trace.done  # last turn's done

        if trace.conversation_id:
            conv_id = trace.conversation_id
        else:
            failures.append(f"turn {i}: no conversation_id observed - cannot thread next turn")
            break

    return not failures, failures, aggregate, time.time() - t0


def evaluate_case(case: dict) -> tuple[bool, list[str], Trace, float]:
    if "turns" in case:
        return evaluate_multi_turn_case(case)
    return evaluate_single_turn_case(case)


GREEN = "\033[32m"
RED = "\033[31m"
DIM = "\033[2m"
RESET = "\033[0m"


def _color(s: str, code: str) -> str:
    return f"{code}{s}{RESET}" if sys.stdout.isatty() else s


def main() -> int:
    cases = yaml.safe_load(CASES_PATH.read_text())
    print(f"Running {len(cases)} eval case(s) against {CHAT_URL}\n", flush=True)

    rows: list[tuple[str, bool, float, list[str], Trace]] = []
    for case in cases:
        ok, failures, trace, elapsed = evaluate_case(case)
        rows.append((case["name"], ok, elapsed, failures, trace))

    name_w = max(len(r[0]) for r in rows)
    print(f"\n{'CASE'.ljust(name_w)}  STATUS   TIME    TOOLS")
    print("-" * (name_w + 40))
    for name, ok, elapsed, _failures, trace in rows:
        status = _color(" PASS ", GREEN) if ok else _color(" FAIL ", RED)
        tools = ",".join(_tool_call_names(trace)) or "-"
        print(f"{name.ljust(name_w)}  {status}  {elapsed:5.1f}s  {tools}")

    failed = [r for r in rows if not r[1]]
    if failed:
        print(f"\n{_color('Failures:', RED)}")
        for name, _ok, _t, failures, trace in failed:
            print(f"\n  {_color(name, RED)}:")
            for f in failures:
                print(f"    - {f}")
            answer = trace.text.strip().replace("\n", " ")
            if answer:
                truncated = answer if len(answer) <= 240 else answer[:240] + "..."
                print(_color(f"    answer: {truncated}", DIM))

    print(f"\n{len(rows) - len(failed)}/{len(rows)} passed.")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
