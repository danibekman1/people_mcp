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

export type StoredMessage = {
  id: number
  conversation_id: string
  idx: number
  role: "user" | "assistant"
  blocks: any[]
  status: MessageStatus
  created_at: string
}
