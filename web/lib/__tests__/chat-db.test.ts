import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  _resetForTests,
  appendMessage,
  createConversation,
  getConversation,
  getDb,
  getMessages,
  listConversations,
  updateTitle,
} from "../chat-db"

const PATH = ":memory:"

beforeEach(() => {
  _resetForTests()
})

afterEach(() => {
  _resetForTests()
})

describe("chat-db", () => {
  it("createConversation + getConversation round-trip", () => {
    const id = createConversation("hello", PATH)
    const c = getConversation(id, PATH)
    expect(c).not.toBeNull()
    expect(c!.id).toBe(id)
    expect(c!.title).toBe("hello")
  })

  it("appendMessage assigns sequential idx per conversation", () => {
    const a = createConversation("A", PATH)
    const b = createConversation("B", PATH)
    appendMessage(a, "user", [{ type: "text", text: "1" }], "done", PATH)
    appendMessage(a, "assistant", [{ type: "text", text: "2" }], "done", PATH)
    appendMessage(b, "user", [{ type: "text", text: "x" }], "done", PATH)
    appendMessage(a, "user", [{ type: "text", text: "3" }], "done", PATH)

    const aMsgs = getMessages(a, PATH)
    expect(aMsgs.map((m) => m.idx)).toEqual([0, 1, 2])
    const bMsgs = getMessages(b, PATH)
    expect(bMsgs.map((m) => m.idx)).toEqual([0])
  })

  it("listConversations orders by updated_at DESC", () => {
    const oldId = createConversation("old", PATH)
    const newId = createConversation("new", PATH)
    // Pin updated_at deterministically; the ORDER BY is what we're testing.
    const db = getDb(PATH)
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(
      "2025-01-01T00:00:00.000Z",
      newId,
    )
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(
      "2026-01-01T00:00:00.000Z",
      oldId,
    )
    const list = listConversations(PATH)
    expect(list[0].id).toBe(oldId)
    expect(list[1].id).toBe(newId)
  })

  it("appendMessage bumps conversations.updated_at", () => {
    const id = createConversation("c", PATH)
    const db = getDb(PATH)
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(
      "2020-01-01T00:00:00.000Z",
      id,
    )
    appendMessage(id, "user", [{ type: "text", text: "hi" }], "done", PATH)
    const after = getConversation(id, PATH)!
    expect(after.updated_at > "2020-01-01T00:00:00.000Z").toBe(true)
  })

  it("appendMessage round-trips blocks via JSON", () => {
    const id = createConversation("c", PATH)
    const blocks = [
      { type: "text", text: "hi" },
      { type: "tool_use", id: "tu_1", name: "list_people", input: { team: "Bread" } },
      { type: "tool_result", tool_use_id: "tu_1", result: { count: 5 }, is_error: false },
    ]
    appendMessage(id, "assistant", blocks, "done", PATH)
    const out = getMessages(id, PATH)
    expect(out).toHaveLength(1)
    expect(out[0].blocks).toEqual(blocks)
    expect(out[0].role).toBe("assistant")
    expect(out[0].status).toBe("done")
  })

  it("updateTitle changes the title", () => {
    const id = createConversation("placeholder", PATH)
    updateTitle(id, "Bread team headcount", PATH)
    expect(getConversation(id, PATH)!.title).toBe("Bread team headcount")
  })

  it("appendMessage persists status='cancelled'", () => {
    const id = createConversation("c", PATH)
    appendMessage(id, "assistant", [{ type: "text", text: "partial" }], "cancelled", PATH)
    expect(getMessages(id, PATH)[0].status).toBe("cancelled")
  })
})
