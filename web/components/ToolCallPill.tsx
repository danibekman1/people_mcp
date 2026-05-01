"use client"
import { useState } from "react"
import type { Block } from "@/lib/types"

export function ToolCallPill({ block }: { block: Extract<Block, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false)
  const statusColor =
    block.status === "pending" ? "#999" : block.status === "ok" ? "#0a7" : "#c33"

  return (
    <div
      style={{
        margin: "8px 0",
        border: `1px solid ${statusColor}`,
        borderRadius: 8,
        padding: "6px 10px",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      <div
        style={{ cursor: "pointer", color: statusColor }}
        onClick={() => setOpen((o) => !o)}
      >
        {block.status === "pending" ? "⏳" : block.status === "ok" ? "✓" : "✗"}{" "}
        <strong>{block.name}</strong>{" "}
        <span style={{ opacity: 0.7 }}>{summarize(block.input)}</span>{" "}
        {open ? "▾" : "▸"}
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div>args:</div>
          <pre style={{ background: "#f4f4f4", padding: 6, overflowX: "auto" }}>
            {JSON.stringify(block.input, null, 2)}
          </pre>
          {block.result !== undefined && (
            <>
              <div>result:</div>
              <pre style={{ background: "#f4f4f4", padding: 6, overflowX: "auto" }}>
                {JSON.stringify(block.result, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function summarize(input: any): string {
  try {
    const s = JSON.stringify(input)
    return s.length > 80 ? s.slice(0, 77) + "…" : s
  } catch {
    return ""
  }
}
