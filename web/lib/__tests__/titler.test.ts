// @vitest-environment node
// titler imports the Anthropic SDK which refuses to load in jsdom
// (it treats jsdom as browser-like and blocks API key usage).
import { describe, expect, it } from "vitest"
import { sanitizeTitle } from "../titler"

describe("sanitizeTitle", () => {
  it("trims whitespace", () => {
    expect(sanitizeTitle("  Bread Team Headcount  ")).toBe("Bread Team Headcount")
  })

  it("strips leading/trailing double quotes", () => {
    expect(sanitizeTitle('"Bread Team Headcount"')).toBe("Bread Team Headcount")
  })

  it("strips leading/trailing single quotes", () => {
    expect(sanitizeTitle("'Bread Team Headcount'")).toBe("Bread Team Headcount")
  })

  it("strips repeated quote chars on either side", () => {
    expect(sanitizeTitle('"""Wrapped"""')).toBe("Wrapped")
  })

  it("preserves quotes in the middle of the title", () => {
    expect(sanitizeTitle("\"What's\" the Total")).toBe("What's\" the Total")
    // The leading double-quote is stripped by the leading regex; the inner
    // quote and the trailing word stay intact.
  })

  it("caps at 80 characters", () => {
    const long = "a".repeat(100)
    expect(sanitizeTitle(long)).toHaveLength(80)
  })

  it("returns empty string when input is just whitespace + quotes", () => {
    expect(sanitizeTitle('   ""   ')).toBe("")
  })

  it("returns empty string for empty input", () => {
    expect(sanitizeTitle("")).toBe("")
  })
})
