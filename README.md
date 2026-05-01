# MCP Chat — People Data

A two-service monorepo demonstrating MCP fluency: a Python FastMCP server that
ingests a 105-person CSV into SQLite and exposes a deliberate four-tool
surface, plus a Next.js chat UI that runs Claude through a visible agentic
loop. The chat UI streams tool calls and results inline so reviewers can watch
the model reason, hit a structured error, and self-correct in real time.

What's intentionally not in scope: auth/RBAC, conversation persistence,
multi-tenant, live FX rates. See "Choices and trade-offs" below.

---

## 1. Run it

You'll need Docker, Docker Compose, and an Anthropic API key
(`https://console.anthropic.com/`). Then:

```bash
./run.sh
# prompts for ANTHROPIC_API_KEY on first run, writes it to .env, then docker compose up
```

Open <http://localhost:3000>.

Manual fallback:

```bash
cp .env.example .env       # then paste ANTHROPIC_API_KEY into .env
docker compose up
```

---

## 2. Architecture

```
┌──────────┐    SSE     ┌──────────────────┐    Anthropic SDK     ┌──────────┐
│ Browser  │ ◄────────► │  Next.js         │ ◄──────────────────► │ Claude   │
│ (React)  │            │  /api/chat       │   (streaming)        │ (Sonnet) │
└──────────┘            │  agentic loop    │                      └──────────┘
                        │                  │
                        │  MCP TS client   │  Streamable HTTP   ┌────────────┐
                        │  (lazy connect)  │ ──────────────────►│ FastMCP    │
                        └──────────────────┘    JSON-RPC 2.0    │ /mcp       │
                                                                │ tools/*    │
                                                                │ resources/*│
                                                                └────────────┘
                                                                       ▲
                                                                       │
                                                                       ▼
                                                                ┌────────────┐
                                                                │ people.db  │
                                                                │ (SQLite)   │
                                                                └────────────┘
```

**Server** (Python 3.12, FastMCP, SQLite): ingests `people-list-export.csv` at
boot, exposes four tools — `list_people`, `aggregate_people`, `get_person`,
`get_org_subtree` — plus a `people://schema` resource.

**Web** (Next.js 15 / TypeScript): an SSE-streaming chat UI. The `/api/chat`
route holds an MCP TS client and Anthropic SDK and runs an agentic loop
(`MAX_ITERS=8`), forwarding text deltas, tool calls, and tool results to the
browser as SSE events. The browser stitches them into a single message bubble
with inline tool-call pills.

---

## 3. Repo tour

```
server/    Python MCP server. tools/ holds the four tool implementations.
           people.db is rebuilt from the CSV at boot; the CSV ships in repo.
web/       Next.js app. /api/chat streams SSE; components/ renders the chat.
           Singleton MCP client + Anthropic SDK live in lib/.
```

The chat backend reads `people://schema` once at boot and injects the distinct
filter values into the system prompt, so the LLM gets factual context up
front. Tool errors are structured (`{"error": "unknown_value", "valid": [...]}`)
and the LLM is instructed to retry with a value from the `valid` list — that's
the self-correction loop you'll see fire in the demo.

---

## 4. Try it

Five questions to paste into the chat:

1. **How many people are on the Bread team?** — direct count.
2. **What is the average salary on the Bread team, in USD per year?** —
   demonstrates multi-currency / multi-frequency normalization.
3. **Show me Oryan Moshe's direct reports.** — org traversal.
4. **How many people are in the Bakery team?** — *this triggers the
   self-correction loop.* "Bakery" isn't a real team; the tool returns a
   structured error with valid alternatives, the model picks the closest
   matches (Bread, Pastry, Viennoiserie), and reports counts for all three.
5. **Who's been here the longest?** — tenure ranking via `list_people` with
   `sort_by: tenure desc`.

Click on a tool-call pill to expand and see the exact arguments and result.

---

## 5. Eval suite

Six end-to-end cases drive `make eval`. Each one POSTs a real question to
`/api/chat`, consumes the SSE stream, and asserts which tools were called,
what arguments they got, and how the final answer reads. Latest green run:

```
Running 6 eval case(s) against http://localhost:3000/api/chat

CASE                   STATUS   TIME    TOOLS
-------------------------------------------------------------
count_by_team           PASS     2.7s  aggregate_people
avg_salary_normalized   PASS     3.2s  aggregate_people
org_traversal           PASS    19.9s  get_org_subtree
self_correction         PASS    37.6s  aggregate_people,aggregate_people,aggregate_people,aggregate_people
ambiguous_intent        PASS    25.6s  aggregate_people
empty_result_phrasing   PASS    25.5s  aggregate_people

6/6 passed.
```

Cases live in `server/eval/cases.yaml`; the harness in
`server/eval/run_eval.py` returns non-zero on any failure (CI-ready).
The four `aggregate_people` calls in `self_correction` are the recovery
loop firing: "Bakery" hits `unknown_value`, the model picks the closest
matches from the structured error's `valid` list (Bread, Pastry,
Viennoiserie) and counts each.

Run it yourself with the docker stack up:

```bash
make eval
```

---

## 6. Inspect the MCP server with Claude Code

If you'd rather inspect the MCP server directly without the chat UI:

```bash
# Verified against `claude mcp add --help`:
claude mcp add --transport http shapes-people http://localhost:8000/mcp
claude mcp list   # should show shapes-people as Connected
```

Then in Claude Code: "What tools do you see from shapes-people?" or paste any
of the suggestions above. The chat UI itself still requires an Anthropic API
key (it's a separate Claude session); this path lets you validate just the
MCP surface in 30 seconds.

---

## 7. How I'd extend this

- **Auth.** A real deployment would sit behind SSO and per-field RBAC (e.g.
  salary visible to managers only). The MCP server is reachable only on the
  docker network in this demo.
- **Conversation persistence.** The design doc has a `chat.db` schema for
  conversations + messages keyed on `blocks_json`; the routes are sketched
  (`GET /api/conversations`, `[id]`). I cut it to land Tier 1 cleanly.
- **Sidebar + auto-titling.** A Haiku call after the first turn produces a
  title; the sidebar renders newest-first. Designed but not implemented.
- **Live FX rates.** Currently static config (`server/config/fx_rates.yaml`,
  `as_of: 2026-04-01`); a periodic fetcher would close that gap.
- **Real-time CSV updates.** Ingestion is one-shot at server startup.

---

## 8. Choices and trade-offs

- **FastMCP** over the lower-level SDK: one decorator per tool keeps the tool
  file at ~30 lines each. Worth the dependency for tool-design clarity.
- **Streamable HTTP transport** (not stdio): production-shaped, lets the
  chat backend be a separate service and lets reviewers point Claude Code at
  the same endpoint with `claude mcp add`.
- **SQLite** for the people store: 105 rows, indexed columns, parameterized
  queries throughout. A larger dataset would justify Postgres; at this scale
  SQLite has zero ops cost.
- **Schema injection in the system prompt** plus **structured tool errors**:
  the LLM either gets the right value the first time (schema gave it the
  list) or the tool tells it what valid values look like and it retries.
  Both mechanisms together kill the "model invents a value" failure mode.
- **Sonnet for chat, Haiku for titles**: chosen on observed reasoning quality
  for chained tool calls. Both are env-overridable
  (`CLAUDE_CHAT_MODEL`, `CLAUDE_TITLE_MODEL`).
- **Visible agentic loop, inline pills**: the whole point of an "AI product"
  signal is making the agent's reasoning legible. Pills appear in pending
  state, flip to ok or error when the result lands.
- **Hourly salaries normalize via `hours_per_year: 2080`** (40 hr/wk × 52
  weeks). Real HR systems would use FTE-aware math; this is a documented
  approximation.
- **Most fields nullable**: one CSV row (Oryan Moshe, `pending_arrival`)
  has only name + email. Forcing NOT NULL would lose the org root. The
  schema relaxes to nullable for everything except identifying fields.

---

## 9. Project structure

```
shapes/
├── README.md
├── Makefile
├── docker-compose.yml
├── run.sh                  # bootstrap: prompts for API key on first run
├── .env.example
├── .gitignore
├── server/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── people_mcp/
│   │   ├── server.py       # FastMCP entry point
│   │   ├── db.py           # connection + schema
│   │   ├── ingest.py       # CSV → SQLite
│   │   ├── salary.py       # FX normalization
│   │   ├── schema.py       # people://schema resource
│   │   ├── errors.py       # structured error builders
│   │   └── tools/
│   │       ├── list_people.py
│   │       ├── aggregate_people.py
│   │       ├── get_person.py
│   │       └── get_org_subtree.py
│   ├── config/fx_rates.yaml
│   ├── data/people-list-export.csv
│   ├── eval/               # cases.yaml + run_eval.py (make eval)
│   └── tests/              # pytest suite (52 tests)
└── web/
    ├── package.json
    ├── Dockerfile
    ├── app/
    │   ├── page.tsx        # the chat UI
    │   └── api/chat/route.ts   # SSE-streaming agentic loop
    ├── components/         # Chat, Message, ToolCallPill, etc.
    └── lib/
        ├── mcp-client.ts   # singleton MCP client + helpers
        ├── anthropic.ts    # Anthropic SDK wrapper
        ├── prompts.ts      # system prompt builder
        ├── sse.ts          # SSE encoder
        └── types.ts
```

Make targets: `make test` runs both unit suites; `make docker-up` brings the
stack up; `make server`/`make web` run individual services natively.

---

## 10. Troubleshooting

- **"Port 3000/8000 already in use."** Stop the offending process or change
  the port mapping in `docker-compose.yml`.
- **"Anthropic rejected the API key."** Check `.env`; `./run.sh` doesn't
  validate the key, it just writes it. Re-run with a fresh key.
- **Chat hangs on first message.** The MCP server's first `tools/list` call
  needs the people DB to be ready (~1 second). The `service_healthy`
  condition in compose handles this; if you're running natively, give the
  server a moment before clicking a suggestion.
- **MCP server restarted; chat is now broken.** The chat backend caches the
  MCP client and tool catalogue. `docker compose restart web` (or restart
  `npm run dev`) clears it.
