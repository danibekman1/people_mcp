import { describe, it, expect } from "vitest"
import { buildSystemPrompt } from "../prompts"

describe("buildSystemPrompt", () => {
  it("includes valid filter values from the schema resource", () => {
    const schema = {
      columns: [{ name: "team", type: "string", nullable: false }],
      distinct_values: { team: ["Bread", "Marketing"] },
      row_count: 105,
      fx_rates_as_of: "2026-04-01",
    }
    const p = buildSystemPrompt(schema)
    expect(p).toContain("Bread")
    expect(p).toContain("Marketing")
    expect(p).toContain("105")
    expect(p).toContain("2026-04-01")
  })

  it("instructs the model to retry on structured errors", () => {
    const schema = { columns: [], distinct_values: {}, row_count: 0, fx_rates_as_of: "" }
    const p = buildSystemPrompt(schema)
    expect(p.toLowerCase()).toContain("retry")
    expect(p.toLowerCase()).toContain("valid")
  })
})
