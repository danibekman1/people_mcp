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
    <div className="border-t border-line bg-bg">
      <form
        className="mx-auto flex w-full max-w-3xl gap-2 px-4 py-3"
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
          className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          placeholder="Ask about the people data..."
          value={v}
          onChange={(e) => setV(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          className={[
            "rounded-md px-4 py-2 text-sm font-medium cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            busy
              ? "bg-err text-white hover:brightness-110 focus-visible:ring-err"
              : "bg-accent text-white hover:brightness-110 focus-visible:ring-accent",
          ].join(" ")}
        >
          {busy ? "Stop" : "Send"}
        </button>
      </form>
    </div>
  )
}
