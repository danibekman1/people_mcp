/**
 * Minimal structured-logging helper.
 *
 * Emits one JSON object per line to stdout (visible in `docker compose logs`).
 * No external dependencies, no transports - this is the smallest thing that
 * still gives us machine-greppable observability.
 *
 * For prod we'd swap stdout for a real transport (otel, pino, datadog),
 * but the call sites stay the same.
 */

type Level = "info" | "warn" | "error"

type LogFields = Record<string, unknown>

function emit(level: Level, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  })
  // Pin to stderr for warn/error so they segregate cleanly in compose logs.
  if (level === "info") {
    console.log(line)
  } else {
    console.error(line)
  }
}

export const log = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
}
