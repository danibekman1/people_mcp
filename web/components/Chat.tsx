"use client"
import { useRef, useState } from "react"
import type { Block, ChatMessage } from "@/lib/types"
import { Message } from "./Message"
import { Composer } from "./Composer"
import { Suggestions } from "./Suggestions"

export function Chat() {
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const requestIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function send(text: string) {
    setBusy(true)
    const requestId = crypto.randomUUID()
    requestIdRef.current = requestId
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const userMsg: ChatMessage = { role: "user", text }
    const assistantMsg: ChatMessage = {
      role: "assistant",
      blocks: [{ kind: "text", text: "" }],
      status: "streaming",
    }
    setMsgs((m) => [...m, userMsg, assistantMsg])

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, request_id: requestId }),
        signal: ctrl.signal,
      })
      if (!res.body) throw new Error("no body")
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 2)
          if (chunk.startsWith("data:")) {
            const ev = JSON.parse(chunk.slice(5).trim())
            applyEvent(ev)
          }
        }
      }
    } catch {
      setMsgs((m) =>
        withLastAssistant(m, (a) => ({ ...a, status: "interrupted" })),
      )
    } finally {
      setBusy(false)
      requestIdRef.current = null
      abortRef.current = null
    }

    function applyEvent(ev: any) {
      setMsgs((m) =>
        withLastAssistant(m, (a) => {
          // Make immutable copies; React Strict Mode runs updaters twice in dev
          // and any in-place mutation would apply twice.
          const blocks: Block[] = a.blocks.map((b) => ({ ...b }))
          if (ev.type === "text") {
            const last = blocks[blocks.length - 1]
            if (last?.kind === "text") {
              blocks[blocks.length - 1] = { kind: "text", text: last.text + ev.delta }
            } else {
              blocks.push({ kind: "text", text: ev.delta })
            }
          } else if (ev.type === "tool_call") {
            blocks.push({
              kind: "tool",
              id: ev.id,
              name: ev.name,
              input: ev.input,
              status: "pending",
            })
            blocks.push({ kind: "text", text: "" }) // anchor for next text
          } else if (ev.type === "tool_result") {
            for (let i = 0; i < blocks.length; i++) {
              const b = blocks[i]
              if (b.kind === "tool" && b.id === ev.tool_use_id) {
                blocks[i] = {
                  ...b,
                  result: ev.result,
                  status: ev.result?.error ? "error" : "ok",
                }
              }
            }
          } else if (ev.type === "done") {
            return { ...a, blocks, status: "done" }
          } else if (ev.type === "cancelled") {
            return { ...a, blocks, status: "cancelled" }
          } else if (ev.type === "error") {
            return { ...a, blocks, status: "error" }
          }
          return { ...a, blocks }
        }),
      )
    }
  }

  async function stop() {
    const id = requestIdRef.current
    if (id) await fetch(`/api/chat?request_id=${id}`, { method: "DELETE" })
    abortRef.current?.abort()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {msgs.length === 0 && <Suggestions onPick={(s) => send(s)} />}
        {msgs.map((m, i) => (
          <Message key={i} msg={m} />
        ))}
      </div>
      <Composer busy={busy} onSend={send} onStop={stop} />
    </div>
  )
}

function withLastAssistant(
  msgs: ChatMessage[],
  fn: (a: Extract<ChatMessage, { role: "assistant" }>) => ChatMessage,
): ChatMessage[] {
  const out = [...msgs]
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "assistant") {
      out[i] = fn(out[i] as any)
      return out
    }
  }
  return out
}
