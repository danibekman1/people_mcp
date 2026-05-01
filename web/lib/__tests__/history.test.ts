import { describe, it, expect } from "vitest"
import { messagesToAnthropicHistory } from "../history"
import type { MessageStatus, PersistedBlock, StoredMessage } from "../types"

let nextId = 1

function user(idx: number, text: string): StoredMessage {
  return {
    id: nextId++,
    conversation_id: "c",
    idx,
    role: "user",
    blocks: [{ type: "text", text }],
    status: "done",
    created_at: "2026-05-01T00:00:00.000Z",
  }
}

function assistant(
  idx: number,
  blocks: PersistedBlock[],
  status: MessageStatus = "done",
): StoredMessage {
  return {
    id: nextId++,
    conversation_id: "c",
    idx,
    role: "assistant",
    blocks,
    status,
    created_at: "2026-05-01T00:00:00.000Z",
  }
}

describe("messagesToAnthropicHistory", () => {
  it("returns empty for empty input", () => {
    expect(messagesToAnthropicHistory([])).toEqual([])
  })

  it("converts a user-only conversation", () => {
    const rows = [user(0, "hello")]
    expect(messagesToAnthropicHistory(rows)).toEqual([
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ])
  })

  it("converts a clean text-only assistant turn", () => {
    const rows = [
      user(0, "hi"),
      assistant(1, [{ type: "text", text: "hello there" }]),
    ]
    expect(messagesToAnthropicHistory(rows)).toEqual([
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "hello there" }] },
    ])
  })

  it("splits assistant tool_use+tool_result into alternating messages", () => {
    const rows = [
      user(0, "how many in Bread?"),
      assistant(1, [
        { type: "text", text: "Let me check." },
        {
          type: "tool_use",
          id: "tu1",
          name: "aggregate_people",
          input: { metric: "count", filters: { team: "Bread" } },
        },
        {
          type: "tool_result",
          tool_use_id: "tu1",
          result: { groups: [{ key: null, value: 7, n: 7 }] },
          is_error: false,
        },
        { type: "text", text: "There are 7 people on the Bread team." },
      ]),
    ]
    expect(messagesToAnthropicHistory(rows)).toEqual([
      { role: "user", content: [{ type: "text", text: "how many in Bread?" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          {
            type: "tool_use",
            id: "tu1",
            name: "aggregate_people",
            input: { metric: "count", filters: { team: "Bread" } },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu1",
            content: JSON.stringify({
              groups: [{ key: null, value: 7, n: 7 }],
            }),
            is_error: false,
          },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "There are 7 people on the Bread team." },
        ],
      },
    ])
  })

  it("splits multi-iteration agentic turns at every tool_result boundary", () => {
    const rows = [
      user(0, "complex"),
      assistant(1, [
        { type: "text", text: "Step 1." },
        {
          type: "tool_use",
          id: "tu1",
          name: "list_people",
          input: { filters: {} },
        },
        {
          type: "tool_result",
          tool_use_id: "tu1",
          result: { count: 1 },
          is_error: false,
        },
        { type: "text", text: "Step 2." },
        {
          type: "tool_use",
          id: "tu2",
          name: "get_person",
          input: { full_name: "X" },
        },
        {
          type: "tool_result",
          tool_use_id: "tu2",
          result: { person: {} },
          is_error: false,
        },
        { type: "text", text: "Done." },
      ]),
    ]
    const out = messagesToAnthropicHistory(rows)
    expect(out).toHaveLength(6)
    expect(out[0].role).toBe("user")
    expect(out[1].role).toBe("assistant")
    expect(out[1].content.map((c: any) => c.type)).toEqual(["text", "tool_use"])
    expect(out[2].role).toBe("user")
    expect(out[2].content[0].type).toBe("tool_result")
    expect(out[3].role).toBe("assistant")
    expect(out[3].content.map((c: any) => c.type)).toEqual(["text", "tool_use"])
    expect(out[4].role).toBe("user")
    expect(out[4].content[0].type).toBe("tool_result")
    expect(out[5].role).toBe("assistant")
    expect(out[5].content[0]).toMatchObject({ type: "text", text: "Done." })
  })

  it("preserves the is_error flag on tool_result blocks", () => {
    const rows = [
      user(0, "Bakery team?"),
      assistant(1, [
        {
          type: "tool_use",
          id: "tu1",
          name: "aggregate_people",
          input: { metric: "count", filters: { team: "Bakery" } },
        },
        {
          type: "tool_result",
          tool_use_id: "tu1",
          result: { error: "unknown_value", field: "team", got: "Bakery" },
          is_error: true,
        },
        { type: "text", text: "Retrying..." },
        {
          type: "tool_use",
          id: "tu2",
          name: "aggregate_people",
          input: { metric: "count", filters: { team: "Bread" } },
        },
        {
          type: "tool_result",
          tool_use_id: "tu2",
          result: { groups: [{ key: null, value: 7, n: 7 }] },
          is_error: false,
        },
      ]),
    ]
    const out = messagesToAnthropicHistory(rows)
    const firstToolResult = (out[2].content[0] as any)
    const secondToolResult = (out[4].content[0] as any)
    expect(firstToolResult.is_error).toBe(true)
    expect(secondToolResult.is_error).toBe(false)
  })

  it("drops cancelled assistant rows and coalesces neighboring user messages", () => {
    const rows = [
      user(0, "ask"),
      assistant(1, [{ type: "text", text: "partial..." }], "cancelled"),
      user(2, "follow-up"),
    ]
    expect(messagesToAnthropicHistory(rows)).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "ask" },
          { type: "text", text: "follow-up" },
        ],
      },
    ])
  })

  it("drops errored assistant rows", () => {
    const rows = [
      user(0, "ask"),
      assistant(1, [{ type: "text", text: "stuck" }], "error"),
    ]
    expect(messagesToAnthropicHistory(rows)).toEqual([
      { role: "user", content: [{ type: "text", text: "ask" }] },
    ])
  })

  it("skips empty text blocks", () => {
    const rows = [
      user(0, "hi"),
      assistant(1, [
        { type: "text", text: "" },
        { type: "text", text: "hello" },
        { type: "text", text: "" },
      ]),
    ]
    const out = messagesToAnthropicHistory(rows)
    expect(out[1]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
    })
  })
})
