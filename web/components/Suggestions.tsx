"use client"
const SUGGESTIONS = [
  "How many people work in London?",
  "What is the average salary on the Bread team, in USD?",
  "Show me Oryan Moshe's direct reports.",
  "How many people are in the Bakery team?",
]

export function Suggestions({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text">
        How can I help?
      </h1>
      <p className="mb-8 text-sm text-text-muted">
        Ask about the people, teams, or org structure.
      </p>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm text-text cursor-pointer transition-colors hover:bg-surface-muted hover:border-text-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
