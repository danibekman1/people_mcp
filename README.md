# MCP Chat — People Data

A two-service monorepo demonstrating MCP fluency: a Python FastMCP server that
ingests a 107-person CSV into SQLite and exposes a deliberate four-tool
surface, plus a Next.js chat UI that runs Claude through a visible agentic
loop. The chat UI streams tool calls and results inline so reviewers can watch
the model reason, hit a structured error, and self-correct in real time.

What's intentionally not in scope: auth/RBAC, multi-tenant, live FX rates.
See "Choices and trade-offs" below.

---

## 1. Prerequisites

- **Docker** + **Docker Compose v2** (Docker Desktop on Mac/Windows; `docker.io`
  on Linux).
- **Git** to clone the repo.
- An **Anthropic API key** - free signup at <https://console.anthropic.com>, copy
  one from "API Keys". New accounts get a small free credit which is plenty
  for this demo.
- Ports **3000** and **8000** free locally (`lsof -i :3000` to check; edit the
  port mapping in `docker-compose.yml` if either is taken).
- Optional: **Claude Code** installed and logged in if you also want to inspect
  the MCP server directly via `claude mcp add` (see §7). This uses Claude
  Code's own auth, so no extra API key is needed for that path.

---

## 2. Run it

```bash
./run.sh
# prompts for ANTHROPIC_API_KEY on first run, writes it to .env, then docker compose up
```

Open <http://localhost:3000>. First build is ~60s; subsequent boots are ~5s.

Manual fallback:

```bash
cp .env.example .env       # then paste ANTHROPIC_API_KEY into .env
docker compose up
```

---

## 3. Architecture

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
`get_org_subtree` — plus a `people://schema` resource and two reusable
prompt templates (`team_summary`, `org_overview`). All three MCP primitives
are used: tools for actions, the resource for schema injection, prompts for
canned analytical workflows the host can offer to users.

**Web** (Next.js 15 / TypeScript): an SSE-streaming chat UI. The `/api/chat`
route holds an MCP TS client and Anthropic SDK and runs an agentic loop
(`MAX_ITERS=8`), forwarding text deltas, tool calls, and tool results to the
browser as SSE events. The browser stitches them into a single message bubble
with inline tool-call pills. Conversations persist to `web/data/chat.db`
(SQLite) with a sidebar for switching between them; new chats are
auto-titled by a Haiku call after the first turn.

---

## 4. Repo tour

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

## 5. Try it

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

The sidebar lists every conversation you've had with the chat (newest-first,
auto-titled by Haiku after the first turn). Click any row to replay the full
back-and-forth — pills, results, answer text — exactly as it happened.
Conversations persist across container restarts via a bind-mounted SQLite DB
at `web/data/chat.db`.

---

## 6. Eval suite

Seven end-to-end cases drive `make eval`. Each one POSTs a real question to
`/api/chat`, consumes the SSE stream, and asserts which tools were called,
what arguments they got, and how the final answer reads. The harness
supports multi-turn cases that thread `conversation_id` between turns to
verify the agentic loop sees prior history. Latest green run:

```
Running 7 eval case(s) against http://localhost:3000/api/chat

CASE                   STATUS   TIME    TOOLS
-------------------------------------------------------------
count_by_team           PASS     4.8s  aggregate_people
avg_salary_normalized   PASS     4.5s  aggregate_people
org_traversal           PASS     7.3s  get_org_subtree
self_correction         PASS    35.1s  aggregate_people,aggregate_people,aggregate_people,aggregate_people
ambiguous_intent        PASS    24.3s  aggregate_people
empty_result_phrasing   PASS    23.8s  aggregate_people
follow_up_currency      PASS    51.3s  aggregate_people,aggregate_people

7/7 passed.
```

Cases live in `server/eval/cases.yaml`; the harness in
`server/eval/run_eval.py` returns non-zero on any failure (CI-ready).
The four `aggregate_people` calls in `self_correction` are the recovery
loop firing: "Bakery" hits `unknown_value`, the model picks the closest
matches from the structured error's `valid` list (Bread, Pastry,
Viennoiserie) and counts each. The two calls in `follow_up_currency` are
the multi-turn check: turn 1 asks for the company-wide average salary in
USD, turn 2 says "And in ILS?" - the second turn must see prior history
to know what's being asked, and call `aggregate_people` with
`target_currency: ILS`.

Run it yourself with the docker stack up:

```bash
make eval
```

---

## 7. Inspect the MCP server with Claude Code

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

The server also exposes two MCP **prompts** (the third MCP primitive,
alongside tools and resources). Hosts that surface prompts in their UI
(Claude Code's slash menu does) get one-click access to canned analytical
workflows:

- `team_summary(team_name)` - headcount, salary band, top roles, longest
  tenure for a named team.
- `org_overview()` - company-wide HR snapshot.

Each prompt encodes a domain-specific workflow as text the agent then
fulfills via `aggregate_people` and `list_people`. They're parameterized,
so e.g. `team_summary(team_name="Bread")` and `team_summary(team_name="Pastry")`
produce the same shape of answer for different teams.

---

## 8. How I'd extend this

- **Auth.** A real deployment would sit behind SSO and per-field RBAC (e.g.
  salary visible to managers only). The MCP server is reachable only on the
  docker network in this demo.
- **Cancellation re-stream.** A cancelled turn's partial assistant blocks
  are persisted with `status='cancelled'` and replayed correctly, but
  there's no "Resume" button to re-send the same prompt against the
  partial - clicking a cancelled conversation just shows the partial.
- **Multi-tab live sync.** Two tabs on the same conversation see each
  other's history on reload but don't share a live SSE stream.
- **Live FX rates.** Currently static config (`server/config/fx_rates.yaml`,
  `as_of: 2026-04-01`); a periodic fetcher would close that gap.
- **Real-time CSV updates.** Ingestion is one-shot at server startup.

---

## 9. Choices and trade-offs

- **FastMCP** over the lower-level SDK: one decorator per tool keeps the tool
  file at ~30 lines each. Worth the dependency for tool-design clarity.
- **Streamable HTTP transport** (not stdio): production-shaped, lets the
  chat backend be a separate service and lets reviewers point Claude Code at
  the same endpoint with `claude mcp add`.
- **SQLite** for the people store: 107 rows, indexed columns, parameterized
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
- **Persisted block format = streaming order, not Anthropic API order.**
  The Anthropic API puts tool_results in the *next* user message, but for
  replay we want them inline with the assistant's text/tool_use blocks
  (that's how the bubble renders live). The persisted assistant row is a
  synthesized interleaved array `[text, tool_use, tool_result-pseudo,
  text, ...]` matching the streaming order. Replay is then a 1:1 mapping
  back to the streaming view-model. (Two small schema deviations from the
  design doc: a `status` column on `messages` to distinguish cancelled
  rows on replay, and millisecond-precision timestamps so multiple writes
  in the same second sort deterministically.)
- **Server-authoritative conversation IDs.** Client posts no ID on first
  turn; server creates the row and returns the UUID on `done`. Sub-second
  lag for the sidebar is fine, and the invariant ("a row exists ↔ the
  server created it") avoids client/server ID-generation contracts.
- **Hourly salaries normalize via `hours_per_year: 2080`** (40 hr/wk × 52
  weeks). Real HR systems would use FTE-aware math; this is a documented
  approximation.
- **Most fields nullable**: one CSV row (Oryan Moshe, `pending_arrival`)
  has only name + email. Forcing NOT NULL would lose the org root. The
  schema relaxes to nullable for everything except identifying fields.

---

## 10. Project structure

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
    ├── data/               # bind-mounted into the container; chat.db lives here
    ├── app/
    │   ├── page.tsx        # two-pane layout: sidebar + chat
    │   └── api/
    │       ├── chat/route.ts          # SSE-streaming agentic loop
    │       └── conversations/         # list + replay endpoints
    ├── components/         # Chat, Message, ToolCallPill, Sidebar, etc.
    └── lib/
        ├── mcp-client.ts   # singleton MCP client + helpers
        ├── anthropic.ts    # Anthropic SDK wrapper
        ├── prompts.ts      # system prompt builder
        ├── chat-db.ts      # better-sqlite3 wrapper (conversations + messages)
        ├── replay.ts       # persisted blocks -> streaming view-model
        ├── titler.ts       # Haiku auto-titling helper
        ├── sse.ts          # SSE encoder
        └── types.ts
```

Make targets: `make test` runs both unit suites; `make eval` runs the
six-case end-to-end eval; `make docker-up` brings the stack up;
`make server`/`make web` run individual services natively.

---

## 11. Troubleshooting

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
