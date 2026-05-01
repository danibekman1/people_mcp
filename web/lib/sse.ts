export function sseEvent(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export function sseStream(generator: AsyncGenerator<any>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of generator) {
          controller.enqueue(encoder.encode(sseEvent(ev)))
        }
      } catch (err) {
        controller.enqueue(encoder.encode(sseEvent({ type: "error", message: String(err) })))
      } finally {
        controller.close()
      }
    },
  })
}
