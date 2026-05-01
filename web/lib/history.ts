/**
 * Convert persisted conversation rows into the Anthropic API's message format.
 *
 * The on-disk format is "streaming order": one assistant row per agentic turn,
 * with text / tool_use / tool_result blocks interleaved (so the UI can replay
 * 1:1). The Anthropic API expects strict alternation:
 *   - assistant message: [text, tool_use, ...]
 *   - user message:      [tool_result, ...] (when responding to a tool_use)
 *
 * For multi-iteration turns (the model called list_people, got the result,
 * then called get_person, got that result, then answered) we split a single
 * persisted row into multiple assistant/user messages along tool_result
 * boundaries.
 *
 * Only assistant rows with status='done' are included. Cancelled and errored
 * rows are dropped because their tool_use/tool_result pairs may be
 * incomplete (Anthropic rejects unmatched tool_use). Adjacent same-role
 * messages produced by drops are coalesced so the alternation stays valid.
 */
import { getMessages } from "./chat-db"
import type { PersistedToolResultBlock, StoredMessage } from "./types"

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result"
      tool_use_id: string
      content: string
      is_error: boolean
    }

export type AnthropicMessage = {
  role: "user" | "assistant"
  content: AnthropicContentBlock[]
}

export function messagesToAnthropicHistory(
  rows: StoredMessage[],
): AnthropicMessage[] {
  const out: AnthropicMessage[] = []

  for (const row of rows) {
    if (row.role === "assistant" && row.status !== "done") continue

    if (row.role === "user") {
      const text = row.blocks
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("")
      if (text) pushOrCoalesce(out, "user", [{ type: "text", text }])
      continue
    }

    // Assistant row: walk blocks in stream order, splitting on tool_result boundaries.
    const blocks = row.blocks
    let i = 0
    while (i < blocks.length) {
      const asstContent: AnthropicContentBlock[] = []
      while (i < blocks.length && blocks[i].type !== "tool_result") {
        const b = blocks[i]
        if (b.type === "text") {
          if (b.text) asstContent.push({ type: "text", text: b.text })
        } else if (b.type === "tool_use") {
          asstContent.push({
            type: "tool_use",
            id: b.id,
            name: b.name,
            input: b.input,
          })
        }
        i++
      }
      if (asstContent.length > 0) {
        pushOrCoalesce(out, "assistant", asstContent)
      }

      const userContent: AnthropicContentBlock[] = []
      while (i < blocks.length && blocks[i].type === "tool_result") {
        const b = blocks[i] as PersistedToolResultBlock
        userContent.push({
          type: "tool_result",
          tool_use_id: b.tool_use_id,
          content: JSON.stringify(b.result),
          is_error: b.is_error,
        })
        i++
      }
      if (userContent.length > 0) {
        pushOrCoalesce(out, "user", userContent)
      }
    }
  }

  return out
}

function pushOrCoalesce(
  out: AnthropicMessage[],
  role: "user" | "assistant",
  content: AnthropicContentBlock[],
): void {
  const last = out[out.length - 1]
  if (last && last.role === role) {
    last.content.push(...content)
  } else {
    out.push({ role, content })
  }
}

export function historyForModel(conversationId: string): AnthropicMessage[] {
  return messagesToAnthropicHistory(getMessages(conversationId))
}
