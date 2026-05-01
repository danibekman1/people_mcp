"use client"
import { useState } from "react"

export function Composer({
  busy,
  onSend,
  onStop,
}: {
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [v, setV] = useState("")
  return (
    <form
      style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #eee" }}
      onSubmit={(e) => {
        e.preventDefault()
        if (busy) {
          onStop()
          return
        }
        if (!v.trim()) return
        onSend(v.trim())
        setV("")
      }}
    >
      <input
        style={{ flex: 1, padding: 8, fontSize: 14 }}
        placeholder="Ask about the people data..."
        value={v}
        onChange={(e) => setV(e.target.value)}
        disabled={busy}
      />
      <button type="submit" style={{ padding: "8px 16px" }}>
        {busy ? "Stop" : "Send"}
      </button>
    </form>
  )
}
