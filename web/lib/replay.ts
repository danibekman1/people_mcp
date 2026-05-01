import type { Block, ChatMessage, PersistedBlock, StoredMessage } from "./types"

/**
 * Convert persisted message rows back into the streaming view-model.
 * Mirrors the block-building logic in Chat.tsx applyEvent so a replayed
 * conversation renders identically to one watched live.
 */
export function storedToChatMessages(rows: StoredMessage[]): ChatMessage[] {
  return rows.map((row): ChatMessage => {
    if (row.role === "user") {
      const text = firstText(row.blocks)
      return { role: "user", text }
    }

    const blocks: Block[] = []
    for (const b of row.blocks) {
      if (b.type === "text") {
        if (b.text) blocks.push({ kind: "text", text: b.text })
      } else if (b.type === "tool_use") {
        blocks.push({ kind: "tool", id: b.id, name: b.name, input: b.input, status: "pending" })
        blocks.push({ kind: "text", text: "" })
      } else if (b.type === "tool_result") {
        for (let i = 0; i < blocks.length; i++) {
          const x = blocks[i]
          if (x.kind === "tool" && x.id === b.tool_use_id) {
            blocks[i] = {
              ...x,
              result: b.result,
              status: b.is_error ? "error" : "ok",
            }
          }
        }
      }
    }

    return { role: "assistant", blocks, status: row.status }
  })
}

function firstText(blocks: PersistedBlock[]): string {
  for (const b of blocks) {
    if (b.type === "text") return b.text
  }
  return ""
}
