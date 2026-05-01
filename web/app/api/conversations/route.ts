import { listConversations } from "@/lib/chat-db"

export const runtime = "nodejs"

export async function GET() {
  const conversations = listConversations()
  return Response.json({ conversations })
}
