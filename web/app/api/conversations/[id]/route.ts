import { getConversation, getMessages } from "@/lib/chat-db"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const conversation = getConversation(id)
  if (!conversation) {
    return Response.json({ error: "not_found" }, { status: 404 })
  }
  const messages = getMessages(id)
  return Response.json({ conversation, messages })
}
