import { NextRequest } from "next/server"
import { z } from "zod"
import { anthropic, CHAT_MODEL, MAX_ITERS } from "@/lib/anthropic"
import { buildSystemPrompt } from "@/lib/prompts"
import { callTool, getSchemaResource, getToolCatalogue } from "@/lib/mcp-client"
import { sseStream } from "@/lib/sse"
import {
  appendMessage,
  createConversation,
  getConversation,
  getMessages,
} from "@/lib/chat-db"
import { historyForModel } from "@/lib/history"
import { titleConversation } from "@/lib/titler"
import type { MessageStatus, PersistedBlock } from "@/lib/types"

export const runtime = "nodejs"

// Request body shape. zod validation happens at the route boundary so the
// rest of the file can trust the inputs - no scattered defensive checks.
const ChatRequestSchema = z.object({
  message: z.string().min(1, "message must not be empty").max(4000, "message exceeds 4000 chars"),
  request_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
})

// In-memory cancellation flags. Keyed by ad-hoc client request id.
const cancelled = new Set<string>()

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = ChatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { message: userMessage, conversation_id: incomingConvId } = parsed.data
  const requestId: string = parsed.data.request_id ?? crypto.randomUUID()

  let conversationId: string
  if (incomingConvId && getConversation(incomingConvId)) {
    conversationId = incomingConvId
  } else {
    conversationId = createConversation(initialTitle(userMessage))
  }
  const isFirstTurn = getMessages(conversationId).length === 0

  // Persist the user message immediately, before the model runs.
  appendMessage(conversationId, "user", [{ type: "text", text: userMessage }])

  const stream = sseStream(runLoop(conversationId, userMessage, requestId, isFirstTurn))
  // (history is loaded inside runLoop so the just-persisted user turn is included)
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Request-Id": requestId,
    },
  })
}

// Stop arriving after the loop has already completed never gets observed;
// expire the flag after 60s so the Set can't leak entries indefinitely.
const CANCEL_TTL_MS = 60_000

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("request_id")
  if (id) {
    cancelled.add(id)
    setTimeout(() => cancelled.delete(id), CANCEL_TTL_MS)
  }
  return new Response(null, { status: 204 })
}

function initialTitle(question: string): string {
  return question.length <= 40 ? question : question.slice(0, 40)
}

type FinalEvent =
  | {
      type: "done"
      conversation_id: string
      total_ms: number
      iters: number
      tool_calls: number
    }
  | { type: "cancelled"; conversation_id: string }
  | { type: "error"; conversation_id: string; message: string }

async function* runLoop(
  conversationId: string,
  userMessage: string,
  requestId: string,
  isFirstTurn: boolean,
): AsyncGenerator<any> {
  const startedAt = Date.now()
  const [tools, schema] = await Promise.all([getToolCatalogue(), getSchemaResource()])
  const system = buildSystemPrompt(schema)
  // Load full conversation history (the new user turn was already persisted by
  // POST() before this generator started, so it's the last entry). Anthropic
  // requires strict role alternation; historyForModel handles the split of our
  // interleaved persisted format and drops incomplete cancelled/errored turns.
  const messages: any[] = historyForModel(conversationId)
  if (messages.length === 0) {
    // Defensive: should never happen in practice, but if persistence somehow
    // failed we fall back to the literal new turn so the request still works.
    messages.push({ role: "user", content: userMessage })
  }
  console.log(
    `[chat] conv=${conversationId.slice(0, 8)} prior=${messages.length} model=${CHAT_MODEL}`,
  )

  // The persisted assistant row interleaves text / tool_use / tool_result
  // pseudo-blocks in stream order, so replay can rebuild the UI 1:1. This is
  // what design §6.5 calls "tool_result pseudo-blocks".
  const persisted: PersistedBlock[] = []
  let status: MessageStatus = "done"
  let totalToolCalls = 0
  let finalEvent: FinalEvent | null = null

  function appendText(text: string) {
    if (!text) return
    const last = persisted[persisted.length - 1]
    if (last && last.type === "text") {
      last.text += text
    } else {
      persisted.push({ type: "text", text })
    }
  }

  try {
    outer: for (let iter = 0; iter < MAX_ITERS; iter++) {
      if (cancelled.has(requestId)) {
        cancelled.delete(requestId)
        status = "cancelled"
        finalEvent = { type: "cancelled", conversation_id: conversationId }
        break outer
      }

      const stream = anthropic.messages.stream({
        model: CHAT_MODEL,
        system,
        tools,
        messages,
        max_tokens: 1024,
      })

      for await (const event of stream) {
        if (cancelled.has(requestId)) {
          ;(stream as any).controller?.abort?.()
          cancelled.delete(requestId)
          status = "cancelled"
          finalEvent = { type: "cancelled", conversation_id: conversationId }
          break outer
        }
        if (
          event.type === "content_block_delta" &&
          (event.delta as any).type === "text_delta"
        ) {
          const delta = (event.delta as any).text
          appendText(delta)
          yield { type: "text", delta }
        }
      }
      const final = await stream.finalMessage()
      const collected: any[] = [...final.content]
      messages.push({ role: "assistant", content: collected })

      // Mirror tool_use blocks into the persisted row, in stream order.
      for (const b of collected) {
        if (b.type === "tool_use") {
          persisted.push({ type: "tool_use", id: b.id, name: b.name, input: b.input })
        }
      }

      const toolUses = collected.filter((b: any) => b.type === "tool_use")
      for (const tu of toolUses as any[]) {
        yield { type: "tool_call", id: tu.id, name: tu.name, input: tu.input }
      }

      if (toolUses.length === 0) {
        status = "done"
        finalEvent = {
          type: "done",
          conversation_id: conversationId,
          total_ms: Date.now() - startedAt,
          iters: iter + 1,
          tool_calls: totalToolCalls,
        }
        break outer
      }

      const results: any[] = []
      for (const tu of toolUses as any[]) {
        let result: any
        const t0 = Date.now()
        try {
          result = await callTool(tu.name, tu.input)
        } catch (err: any) {
          result = { error: "internal_error", message: String(err) }
        }
        totalToolCalls++
        const isError = Boolean(result?.error)
        persisted.push({
          type: "tool_result",
          tool_use_id: tu.id,
          result,
          is_error: isError,
        })
        yield { type: "tool_result", tool_use_id: tu.id, result, ms: Date.now() - t0 }
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          is_error: isError,
        })
      }
      messages.push({ role: "user", content: results })
    }
    if (!finalEvent) {
      status = "error"
      finalEvent = {
        type: "error",
        conversation_id: conversationId,
        message: "max iterations exceeded",
      }
    }
  } finally {
    // Always release the cancellation flag, whether we observed it or not.
    // Combined with the TTL sweep on the DELETE handler, this keeps the Set
    // bounded across both completion-after-cancel and cancel-after-completion.
    cancelled.delete(requestId)

    // Title only on the success path. Cancelled or errored turns skip the
    // Haiku call so the user pays no extra latency for a turn they're
    // already abandoning. The title lands in chat.db before yielding 'done',
    // so the sidebar refresh fired by 'done' picks it up via re-fetch.
    if (isFirstTurn && finalEvent?.type === "done") {
      try {
        await titleConversation(conversationId, userMessage)
      } catch (err) {
        console.error("auto-titling failed", err)
      }
    }
    if (persisted.length > 0) {
      try {
        appendMessage(conversationId, "assistant", persisted, status)
      } catch (err) {
        console.error("appendMessage failed", err)
      }
    }
    if (finalEvent) yield finalEvent
  }
}
