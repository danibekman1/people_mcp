export type Block =
  | { kind: "text"; text: string }
  | {
      kind: "tool"
      id: string
      name: string
      input: any
      result?: any
      status: "pending" | "ok" | "error"
    }

export type ChatMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant"
      blocks: Block[]
      status: "streaming" | "done" | "interrupted" | "cancelled" | "error"
    }

export type Conversation = {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export type MessageStatus = "done" | "cancelled" | "error"

// The on-disk block format. Assistant rows interleave text / tool_use /
// tool_result pseudo-blocks in stream order so replay can rebuild the UI 1:1
// (see docs/plans/2026-05-01-mcp-chat-design.md §6.5). User rows hold a
// single text block.
export type PersistedTextBlock = { type: "text"; text: string }
export type PersistedToolUseBlock = {
  type: "tool_use"
  id: string
  name: string
  input: unknown
}
export type PersistedToolResultBlock = {
  type: "tool_result"
  tool_use_id: string
  result: unknown
  is_error: boolean
}
export type PersistedBlock =
  | PersistedTextBlock
  | PersistedToolUseBlock
  | PersistedToolResultBlock

export type StoredMessage = {
  id: number
  conversation_id: string
  idx: number
  role: "user" | "assistant"
  blocks: PersistedBlock[]
  status: MessageStatus
  created_at: string
}
