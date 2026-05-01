"use client"
import { useEffect, useMemo, useState } from "react"
import type { Conversation } from "@/lib/types"

export function Sidebar({
  activeId,
  onSelect,
  onNew,
  refreshKey,
}: {
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  refreshKey: number
}) {
  const [convos, setConvos] = useState<Conversation[]>([])

  useEffect(() => {
    let cancelled = false
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setConvos(j.conversations ?? [])
      })
      .catch(() => {
        if (!cancelled) setConvos([])
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const groups = useMemo(() => groupByDate(convos), [convos])

  return (
    <aside className="flex h-screen w-[280px] flex-col bg-surface-muted border-r border-line">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:brightness-110 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-muted"
        >
          + New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {convos.length === 0 && (
          <div className="px-3 py-4 text-xs text-text-muted">
            No conversations yet.
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
              {g.label}
            </div>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((c) => {
                const active = c.id === activeId
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onSelect(c.id)}
                      title={c.title}
                      className={[
                        "group relative block w-full truncate rounded-md px-3 py-2 text-left text-[13px] cursor-pointer transition-colors",
                        active
                          ? "bg-accent-soft text-text shadow-[inset_2px_0_0_var(--accent)]"
                          : "text-text hover:bg-surface",
                      ].join(" ")}
                    >
                      {c.title || "(untitled)"}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  )
}

function groupByDate(convos: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86_400_000
  const sevenDaysAgo = startOfToday - 7 * 86_400_000
  const thirtyDaysAgo = startOfToday - 30 * 86_400_000

  const buckets: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Previous 30 days", items: [] },
    { label: "Older", items: [] },
  ]

  for (const c of convos) {
    const t = new Date(c.updated_at).getTime()
    if (Number.isNaN(t)) {
      buckets[4].items.push(c)
      continue
    }
    if (t >= startOfToday) buckets[0].items.push(c)
    else if (t >= startOfYesterday) buckets[1].items.push(c)
    else if (t >= sevenDaysAgo) buckets[2].items.push(c)
    else if (t >= thirtyDaysAgo) buckets[3].items.push(c)
    else buckets[4].items.push(c)
  }

  return buckets.filter((b) => b.items.length > 0)
}
