"use client"
const SUGGESTIONS = [
  "How many people work in London?",
  "What is the average salary on the Bread team, in USD?",
  "Show me Oryan Moshe's direct reports.",
  "How many people are in the Bakery team?",
]

export function Suggestions({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        padding: 24,
      }}
    >
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          style={{
            padding: 12,
            textAlign: "left",
            border: "1px solid #ddd",
            borderRadius: 8,
            background: "white",
            cursor: "pointer",
          }}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
