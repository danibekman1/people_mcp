"use client"
import { useEffect, useState } from "react"
import type { Conversation } from "@/lib/types"

export function Sidebar({
  activeId,
  onSelect,
  onNew,
  refreshKey,
}: {
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  refreshKey: number
}) {
  const [convos, setConvos] = useState<Conversation[]>([])

  useEffect(() => {
    let cancelled = false
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setConvos(j.conversations ?? [])
      })
      .catch(() => {
        if (!cancelled) setConvos([])
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <aside
      style={{
        width: 260,
        borderRight: "1px solid #eee",
        display: "flex",
        flexDirection: "column",
        background: "#fafafa",
      }}
    >
      <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
        <button
          onClick={onNew}
          style={{
            width: "100%",
            padding: "8px 12px",
            fontSize: 14,
            background: "white",
            border: "1px solid #ddd",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          + New chat
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {convos.length === 0 && (
          <div style={{ padding: 12, fontSize: 13, color: "#999" }}>
            No conversations yet.
          </div>
        )}
        {convos.map((c) => {
          const active = c.id === activeId
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              title={c.title}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                fontSize: 13,
                background: active ? "#e8e8f0" : "transparent",
                border: "none",
                borderBottom: "1px solid #eee",
                cursor: "pointer",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "#222",
              }}
            >
              {c.title || "(untitled)"}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
