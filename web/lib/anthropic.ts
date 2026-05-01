import Anthropic from "@anthropic-ai/sdk"

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
})

export const CHAT_MODEL = process.env.CLAUDE_CHAT_MODEL ?? "claude-sonnet-4-6"
export const TITLE_MODEL = process.env.CLAUDE_TITLE_MODEL ?? "claude-haiku-4-5-20251001"

export const MAX_ITERS = 8
