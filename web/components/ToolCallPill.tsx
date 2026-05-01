"use client"
import { useState } from "react"
import type { Block } from "@/lib/types"

type ToolBlock = Extract<Block, { kind: "tool" }>

export function ToolCallPill({ block }: { block: ToolBlock }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="my-2 rounded-md bg-surface-muted text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left cursor-pointer rounded-md hover:bg-line/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <StatusDot status={block.status} />
        <span className="font-mono font-semibold text-text">{block.name}</span>
        <span className="truncate font-mono text-text-muted">
          {summarize(block.input)}
        </span>
        <Chevron open={open} className="ml-auto shrink-0 text-text-muted" />
      </button>
      {open && (
        <div className="border-t border-line px-2.5 py-2 font-mono">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">
            args
          </div>
          <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-text">
            {JSON.stringify(block.input, null, 2)}
          </pre>
          {block.result !== undefined && (
            <>
              <div className="mt-2 text-[11px] uppercase tracking-wider text-text-muted">
                result
              </div>
              <pre
                className={[
                  "mt-1 overflow-x-auto rounded p-2",
                  block.status === "error"
                    ? "bg-surface text-err"
                    : "bg-surface text-text",
                ].join(" ")}
              >
                {JSON.stringify(block.result, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: ToolBlock["status"] }) {
  const cls =
    status === "pending"
      ? "bg-text-muted animate-pulse"
      : status === "ok"
        ? "bg-ok"
        : "bg-err"
  return (
    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />
  )
}

function Chevron({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={[
        "transition-transform duration-150",
        open ? "rotate-90" : "",
        className,
      ].join(" ")}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function summarize(input: unknown): string {
  try {
    const s = JSON.stringify(input)
    return s.length > 80 ? s.slice(0, 77) + "…" : s
  } catch {
    return ""
  }
}
