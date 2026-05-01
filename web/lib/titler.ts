import { anthropic, TITLE_MODEL } from "./anthropic"
import { updateTitle } from "./chat-db"

const TITLE_TIMEOUT_MS = 1500

/**
 * Generate a 4-6 word title for a new conversation using Haiku.
 *
 * Returns the new title (and writes it to chat.db) on success, or null on
 * timeout/failure - callers should fall back to whatever placeholder title
 * was set when the conversation was created.
 */
export async function titleConversation(
  conversationId: string,
  question: string,
): Promise<string | null> {
  try {
    const result = await Promise.race([
      anthropic.messages.create({
        model: TITLE_MODEL,
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `In 4 to 6 words, title the following user question: ${question}. Return only the title, no quotes.`,
          },
        ],
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TITLE_TIMEOUT_MS)),
    ])
    if (!result) return null
    const block = (result as any).content?.[0]
    if (block?.type !== "text") return null
    const title = String(block.text)
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .slice(0, 80)
    if (!title) return null
    updateTitle(conversationId, title)
    return title
  } catch (err) {
    console.error("titleConversation failed", err)
    return null
  }
}
