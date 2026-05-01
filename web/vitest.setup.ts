import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

// Clear the rendered DOM between tests; otherwise multiple test cases stack
// up and selectors hit duplicates.
afterEach(() => {
  cleanup()
})
