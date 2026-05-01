import { describe, expect, it } from "vitest"
import { storedToChatMessages } from "../replay"
import type { StoredMessage } from "../types"

describe("storedToChatMessages", () => {
  it("converts a user row to a user ChatMessage", () => {
    const rows: StoredMessage[] = [
      {
        id: 1,
        conversation_id: "c",
        idx: 0,
        role: "user",
        blocks: [{ type: "text", text: "hello" }],
        status: "done",
        created_at: "2026-01-01",
      },
    ]
    expect(storedToChatMessages(rows)).toEqual([{ role: "user", text: "hello" }])
  })

  it("converts an assistant row with text + tool_use + tool_result + text", () => {
    const rows: StoredMessage[] = [
      {
        id: 1,
        conversation_id: "c",
        idx: 0,
        role: "assistant",
        blocks: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "tu_1", name: "aggregate_people", input: { team: "Bread" } },
          { type: "tool_result", tool_use_id: "tu_1", result: { count: 13 }, is_error: false },
          { type: "text", text: "There are 13 people on the Bread team." },
        ],
        status: "done",
        created_at: "2026-01-01",
      },
    ]
    const out = storedToChatMessages(rows)
    expect(out).toHaveLength(1)
    const m = out[0]
    if (m.role !== "assistant") throw new Error("expected assistant")
    expect(m.status).toBe("done")
    // The pill should land in 'ok' state with the result attached.
    expect(m.blocks).toEqual([
      { kind: "text", text: "Let me check." },
      {
        kind: "tool",
        id: "tu_1",
        name: "aggregate_people",
        input: { team: "Bread" },
        result: { count: 13 },
        status: "ok",
      },
      { kind: "text", text: "" },
      { kind: "text", text: "There are 13 people on the Bread team." },
    ])
  })

  it("marks error tool_results with status='error'", () => {
    const rows: StoredMessage[] = [
      {
        id: 1,
        conversation_id: "c",
        idx: 0,
        role: "assistant",
        blocks: [
          { type: "tool_use", id: "tu_1", name: "aggregate_people", input: { team: "Bakery" } },
          {
            type: "tool_result",
            tool_use_id: "tu_1",
            result: { error: "unknown_value", valid: ["Bread"] },
            is_error: true,
          },
        ],
        status: "done",
        created_at: "2026-01-01",
      },
    ]
    const m = storedToChatMessages(rows)[0]
    if (m.role !== "assistant") throw new Error("expected assistant")
    const tool = m.blocks.find((b) => b.kind === "tool")!
    if (tool.kind !== "tool") throw new Error("expected tool")
    expect(tool.status).toBe("error")
    expect(tool.result).toEqual({ error: "unknown_value", valid: ["Bread"] })
  })

  it("preserves the row's status for cancelled assistant rows", () => {
    const rows: StoredMessage[] = [
      {
        id: 1,
        conversation_id: "c",
        idx: 0,
        role: "assistant",
        blocks: [{ type: "text", text: "partial" }],
        status: "cancelled",
        created_at: "2026-01-01",
      },
    ]
    const m = storedToChatMessages(rows)[0]
    if (m.role !== "assistant") throw new Error("expected assistant")
    expect(m.status).toBe("cancelled")
  })
})
