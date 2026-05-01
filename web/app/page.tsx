"use client"
import { useEffect, useState } from "react"
import { Chat } from "@/components/Chat"
import { Sidebar } from "@/components/Sidebar"
import { storedToChatMessages } from "@/lib/replay"
import type { ChatMessage } from "@/lib/types"

export default function Page() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [initial, setInitial] = useState<ChatMessage[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!conversationId) {
      setInitial([])
      return
    }
    let cancelled = false
    fetch(`/api/conversations/${conversationId}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((j) => {
        if (cancelled) return
        setInitial(storedToChatMessages(j.messages ?? []))
      })
      .catch(() => {
        if (!cancelled) setInitial([])
      })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Sidebar
        activeId={conversationId}
        onSelect={(id) => setConversationId(id)}
        onNew={() => setConversationId(null)}
        refreshKey={refreshKey}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Chat
          key={conversationId ?? "new"}
          conversationId={conversationId}
          initialMessages={initial}
          onConversationCreated={(id) => setConversationId(id)}
          onTurnDone={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    </div>
  )
}
