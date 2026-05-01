import { NextRequest, NextResponse } from "next/server"
import { anthropic, CHAT_MODEL, MAX_ITERS } from "@/lib/anthropic"
import { buildSystemPrompt } from "@/lib/prompts"
import { callTool, getSchemaResource, getToolCatalogue } from "@/lib/mcp-client"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const userMessage: string = body.message
  if (!userMessage) {
    return NextResponse.json({ error: "missing 'message'" }, { status: 400 })
  }

  const [tools, schema] = await Promise.all([getToolCatalogue(), getSchemaResource()])
  const system = buildSystemPrompt(schema)

  const messages: any[] = [{ role: "user", content: userMessage }]
  const events: any[] = []

  for (let i = 0; i < MAX_ITERS; i++) {
    const resp = await anthropic.messages.create({
      model: CHAT_MODEL,
      system,
      tools,
      messages,
      max_tokens: 1024,
    })

    messages.push({ role: "assistant", content: resp.content })

    const toolUses = resp.content.filter((b: any) => b.type === "tool_use")
    for (const tu of toolUses) {
      events.push({
        type: "tool_call",
        id: (tu as any).id,
        name: (tu as any).name,
        input: (tu as any).input,
      })
    }

    if (toolUses.length === 0) {
      const text = resp.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("")
      events.push({ type: "text", text })
      events.push({ type: "done" })
      return NextResponse.json({ events, finalText: text })
    }

    const toolResults: any[] = []
    for (const tu of toolUses as any[]) {
      let result: any
      try {
        result = await callTool(tu.name, tu.input)
      } catch (err: any) {
        result = { error: "internal_error", message: String(err) }
      }
      events.push({ type: "tool_result", tool_use_id: tu.id, result })
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
        is_error: Boolean(result?.error),
      })
    }
    messages.push({ role: "user", content: toolResults })
  }

  events.push({ type: "error", message: "max iterations exceeded" })
  return NextResponse.json({ events, finalText: "" }, { status: 500 })
}
