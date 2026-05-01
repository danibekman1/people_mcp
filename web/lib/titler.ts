import { anthropic, TITLE_MODEL } from "./anthropic"
import { updateTitle } from "./chat-db"

const TITLE_TIMEOUT_MS = 1500

/**
 * Generate a 4-6 word title for a new conversation using Haiku.
 *
 * Returns the title (and writes it to chat.db) on success, or null on
 * timeout/failure - callers fall back to whatever placeholder title was set
 * when the conversation was created.
 *
 * Uses an AbortController so a timed-out request actually cancels the
 * underlying HTTP call rather than leaking it into the void.
 */
export async function titleConversation(
  conversationId: string,
  question: string,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS)
  try {
    const result = await anthropic.messages.create(
      {
        model: TITLE_MODEL,
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `In 4 to 6 words, title the following user question: ${question}. Return only the title, no quotes.`,
          },
        ],
      },
      { signal: controller.signal },
    )
    const block = result.content[0]
    if (block?.type !== "text") return null
    const title = sanitizeTitle(block.text)
    if (!title) return null
    updateTitle(conversationId, title)
    return title
  } catch (err: any) {
    if (err?.name === "AbortError") return null
    console.error("titleConversation failed", err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function sanitizeTitle(raw: string): string {
  return String(raw)
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .slice(0, 80)
}
