import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class Chats {
  constructor(path = "./data/chats.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS chats
      (id TEXT PRIMARY KEY, owner TEXT NOT NULL, guild TEXT NOT NULL, title TEXT NOT NULL,
       kind TEXT NOT NULL, updated INTEGER NOT NULL, messages TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS chat_owner ON chats(owner,guild,updated);`);
    this.pending = new Set();
  }
  list(owner, guild) {
    return this.db
      .prepare(
        "SELECT id,title,kind,updated FROM chats WHERE owner=? AND guild=? ORDER BY updated DESC LIMIT 100",
      )
      .all(owner, guild);
  }
  get(owner, guild, id) {
    const row = this.db
      .prepare("SELECT * FROM chats WHERE owner=? AND guild=? AND id=?")
      .get(owner, guild, id);
    if (!row) throw new Error("Conversation not found.");
    return { ...row, messages: JSON.parse(row.messages) };
  }
  create(owner, guild, kind = "chat") {
    if (!["chat", "plan"].includes(kind))
      throw new Error("Choose chat or server builder.");
    if (this.list(owner, guild).length >= 100)
      throw new Error(
        "You have 100 saved chats in this server. Delete an old chat first.",
      );
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO chats VALUES (?,?,?,?,?,?,?)")
      .run(id, owner, guild, "New conversation", kind, Date.now(), "[]");
    return this.get(owner, guild, id);
  }
  remove(owner, guild, id) {
    this.get(owner, guild, id);
    if (this.pending.has(id)) throw new Error("Wait for this reply to finish.");
    this.db
      .prepare("DELETE FROM chats WHERE owner=? AND guild=? AND id=?")
      .run(owner, guild, id);
    return { deleted: true };
  }
  async send(owner, guild, id, text, request, options = {}) {
    const chat = this.get(owner, guild, id);
    if (typeof text !== "string" || !text.trim() || text.length > 1500)
      throw new Error("Write 1–1,500 characters.");
    if (chat.messages.length >= 200)
      throw new Error("Start a new conversation after 100 replies.");
    if (this.pending.has(id)) throw new Error("Wait for this reply to finish.");
    this.pending.add(id);
    try {
      const context = chat.messages
        .slice(-6)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")
        .slice(-2200);
      chat.messages.push({ role: "user", content: text, time: Date.now() });
      const save = () =>
        this.db
          .prepare(
            "UPDATE chats SET title=?,updated=?,messages=? WHERE id=? AND owner=? AND guild=?",
          )
          .run(
            chat.messages.find((m) => m.role === "user").content.slice(0, 55),
            Date.now(),
            JSON.stringify(chat.messages),
            id,
            owner,
            guild,
          );
      save();
      let result;
      try {
        result =
          chat.kind === "plan"
            ? await request("plan", {
                description: text,
                context,
                ai: options.ai !== false,
              })
            : await request("chat", {
                question:
                  (context
                    ? "Conversation so far:\n" +
                      context +
                      "\n\nLatest question: "
                    : "") + text,
              });
        chat.messages.push({
          role: "assistant",
          content:
            result.reply || "Your layout is ready. Review it before building.",
          ...(result.plan ? { draft: result } : {}),
          time: Date.now(),
        });
      } catch (e) {
        chat.messages.push({
          role: "assistant",
          content: e.message,
          error: true,
          time: Date.now(),
        });
        save();
        throw e;
      }
      save();
      return this.get(owner, guild, id);
    } finally {
      this.pending.delete(id);
    }
  }
  close() {
    this.db.close();
  }
}
