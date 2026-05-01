import type { ChatMessage } from "@/lib/types"
import { ToolCallPill } from "./ToolCallPill"

export function Message({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div
        style={{
          alignSelf: "flex-end",
          background: "#dde",
          borderRadius: 12,
          padding: "8px 12px",
          maxWidth: 600,
        }}
      >
        {msg.text}
      </div>
    )
  }
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: 800 }}>
      {msg.blocks.map((b, i) =>
        b.kind === "text" ? (
          <div key={i} style={{ whiteSpace: "pre-wrap" }}>
            {b.text}
          </div>
        ) : (
          <ToolCallPill key={i} block={b} />
        )
      )}
      {msg.status === "interrupted" && (
        <div style={{ color: "#c33", fontSize: 12 }}>(interrupted)</div>
      )}
      {msg.status === "cancelled" && (
        <div style={{ color: "#999", fontSize: 12 }}>(stopped)</div>
      )}
    </div>
  )
}
