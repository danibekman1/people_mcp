import Database from "better-sqlite3"
import { mkdirSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import type {
  Conversation,
  MessageStatus,
  PersistedBlock,
  StoredMessage,
} from "./types"

const DEFAULT_PATH = process.env.CHAT_DB_PATH ?? "data/chat.db"

let _db: Database.Database | null = null
let _dbPath: string | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  idx             INTEGER NOT NULL,
  role            TEXT NOT NULL,
  blocks_json     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'done',
  created_at      TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(conversation_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, idx);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
`

export function getDb(path: string = DEFAULT_PATH): Database.Database {
  if (_db && _dbPath === path) return _db
  if (_db && _dbPath !== path) {
    _db.close()
    _db = null
  }
  if (path !== ":memory:") {
    const abs = isAbsolute(path) ? path : resolve(process.cwd(), path)
    mkdirSync(dirname(abs), { recursive: true })
    _db = new Database(abs)
  } else {
    _db = new Database(":memory:")
  }
  _db.pragma("journal_mode = WAL")
  _db.exec(SCHEMA)
  _dbPath = path
  return _db
}

export function _resetForTests(): void {
  if (_db) _db.close()
  _db = null
  _dbPath = null
}

export function createConversation(title: string, path?: string): string {
  const db = getDb(path ?? DEFAULT_PATH)
  const id = randomUUID()
  db.prepare("INSERT INTO conversations (id, title) VALUES (?, ?)").run(id, title)
  return id
}

export function listConversations(path?: string): Conversation[] {
  const db = getDb(path ?? DEFAULT_PATH)
  return db
    .prepare(
      "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC, id DESC",
    )
    .all() as Conversation[]
}

export function getConversation(id: string, path?: string): Conversation | null {
  const db = getDb(path ?? DEFAULT_PATH)
  const row = db
    .prepare(
      "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?",
    )
    .get(id) as Conversation | undefined
  return row ?? null
}

export function getMessages(conversationId: string, path?: string): StoredMessage[] {
  const db = getDb(path ?? DEFAULT_PATH)
  const rows = db
    .prepare(
      "SELECT id, conversation_id, idx, role, blocks_json, status, created_at FROM messages WHERE conversation_id = ? ORDER BY idx ASC",
    )
    .all(conversationId) as Array<Omit<StoredMessage, "blocks"> & { blocks_json: string }>
  return rows.map((r) => ({
    id: r.id,
    conversation_id: r.conversation_id,
    idx: r.idx,
    role: r.role,
    blocks: JSON.parse(r.blocks_json) as PersistedBlock[],
    status: r.status,
    created_at: r.created_at,
  }))
}

export function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  blocks: PersistedBlock[],
  status: MessageStatus = "done",
  path?: string,
): void {
  const db = getDb(path ?? DEFAULT_PATH)
  const tx = db.transaction(() => {
    const next = db
      .prepare(
        "SELECT COALESCE(MAX(idx), -1) + 1 AS next FROM messages WHERE conversation_id = ?",
      )
      .get(conversationId) as { next: number }
    db.prepare(
      "INSERT INTO messages (conversation_id, idx, role, blocks_json, status) VALUES (?, ?, ?, ?, ?)",
    ).run(conversationId, next.next, role, JSON.stringify(blocks), status)
    db.prepare(
      "UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    ).run(conversationId)
  })
  tx()
}

export function updateTitle(id: string, title: string, path?: string): void {
  const db = getDb(path ?? DEFAULT_PATH)
  db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(title, id)
}
