import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { ChatMessage } from "@/lib/types"
import { ToolCallPill } from "./ToolCallPill"

export function Message({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-line bg-accent-soft px-3.5 py-2 text-[14px] text-text whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-full text-[14px] leading-relaxed text-text">
        {msg.blocks.map((b, i) =>
          b.kind === "text" ? (
            <div key={i} className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{b.text}</ReactMarkdown>
            </div>
          ) : (
            <ToolCallPill key={i} block={b} />
          ),
        )}
        {msg.status === "interrupted" && (
          <div className="mt-1 text-xs text-err">(interrupted)</div>
        )}
        {msg.status === "cancelled" && (
          <div className="mt-1 text-xs text-text-muted">(stopped)</div>
        )}
      </div>
    </div>
  )
}
