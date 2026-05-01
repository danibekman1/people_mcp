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
