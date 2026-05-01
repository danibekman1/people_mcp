import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Composer } from "../Composer"

describe("Composer", () => {
  it("renders the Send button when idle", () => {
    render(<Composer busy={false} onSend={() => {}} onStop={() => {}} />)
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument()
  })

  it("flips to a Stop button while busy", () => {
    render(<Composer busy={true} onSend={() => {}} onStop={() => {}} />)
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument()
  })

  it("disables the input while busy", () => {
    render(<Composer busy={true} onSend={() => {}} onStop={() => {}} />)
    expect(screen.getByPlaceholderText(/ask about/i)).toBeDisabled()
  })

  it("calls onSend with the trimmed value and clears the input", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Composer busy={false} onSend={onSend} onStop={() => {}} />)
    const input = screen.getByPlaceholderText(/ask about/i)
    await user.type(input, "  hello world  ")
    await user.click(screen.getByRole("button", { name: "Send" }))
    expect(onSend).toHaveBeenCalledWith("hello world")
    expect(input).toHaveValue("")
  })

  it("does not call onSend on whitespace-only input", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Composer busy={false} onSend={onSend} onStop={() => {}} />)
    await user.type(screen.getByPlaceholderText(/ask about/i), "   ")
    await user.click(screen.getByRole("button", { name: "Send" }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it("calls onStop (not onSend) when the button is clicked while busy", async () => {
    const onSend = vi.fn()
    const onStop = vi.fn()
    const user = userEvent.setup()
    render(<Composer busy={true} onSend={onSend} onStop={onStop} />)
    await user.click(screen.getByRole("button", { name: "Stop" }))
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it("submits via Enter when not busy", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Composer busy={false} onSend={onSend} onStop={() => {}} />)
    const input = screen.getByPlaceholderText(/ask about/i)
    await user.type(input, "via enter{Enter}")
    expect(onSend).toHaveBeenCalledWith("via enter")
  })
})
