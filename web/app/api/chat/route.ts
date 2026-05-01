import { NextRequest } from "next/server"
import { anthropic, CHAT_MODEL, MAX_ITERS } from "@/lib/anthropic"
import { buildSystemPrompt } from "@/lib/prompts"
import { callTool, getSchemaResource, getToolCatalogue } from "@/lib/mcp-client"
import { sseStream } from "@/lib/sse"

export const runtime = "nodejs"

// In-memory cancellation flags. Keyed by ad-hoc client request id.
const cancelled = new Set<string>()

export async function POST(req: NextRequest) {
  const body = await req.json()
  const userMessage: string = body.message
  const requestId: string = body.request_id ?? crypto.randomUUID()
  if (!userMessage) {
    return new Response(JSON.stringify({ error: "missing 'message'" }), { status: 400 })
  }

  const stream = sseStream(runLoop(userMessage, requestId))
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Request-Id": requestId,
    },
  })
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("request_id")
  if (id) cancelled.add(id)
  return new Response(null, { status: 204 })
}

async function* runLoop(userMessage: string, requestId: string): AsyncGenerator<any> {
  const startedAt = Date.now()
  const [tools, schema] = await Promise.all([getToolCatalogue(), getSchemaResource()])
  const system = buildSystemPrompt(schema)
  const messages: any[] = [{ role: "user", content: userMessage }]

  let totalToolCalls = 0
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    if (cancelled.has(requestId)) {
      yield { type: "cancelled" }
      cancelled.delete(requestId)
      return
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
        yield { type: "cancelled" }
        cancelled.delete(requestId)
        return
      }
      if (
        event.type === "content_block_delta" &&
        (event.delta as any).type === "text_delta"
      ) {
        yield { type: "text", delta: (event.delta as any).text }
      }
    }
    const final = await stream.finalMessage()
    const collected: any[] = [...final.content]
    messages.push({ role: "assistant", content: collected })

    const toolUses = collected.filter((b: any) => b.type === "tool_use")
    for (const tu of toolUses as any[]) {
      yield { type: "tool_call", id: tu.id, name: tu.name, input: tu.input }
    }

    if (toolUses.length === 0) {
      yield {
        type: "done",
        total_ms: Date.now() - startedAt,
        iters: iter + 1,
        tool_calls: totalToolCalls,
      }
      return
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
      yield { type: "tool_result", tool_use_id: tu.id, result, ms: Date.now() - t0 }
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
        is_error: Boolean(result?.error),
      })
    }
    messages.push({ role: "user", content: results })
  }
  yield { type: "error", message: "max iterations exceeded" }
}
