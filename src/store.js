import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class Store {
  constructor(path = process.env.DATABASE_PATH || "./data/fainted.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS kv (guild TEXT, key TEXT, value TEXT NOT NULL, PRIMARY KEY(guild,key));
      CREATE TABLE IF NOT EXISTS cases (id INTEGER PRIMARY KEY AUTOINCREMENT, guild TEXT, user TEXT, actor TEXT, action TEXT, reason TEXT, time INTEGER);
      CREATE TABLE IF NOT EXISTS activity (guild TEXT, user TEXT, day TEXT, messages INTEGER DEFAULT 0, PRIMARY KEY(guild,user,day));
      CREATE TABLE IF NOT EXISTS members (guild TEXT, user TEXT, xp INTEGER DEFAULT 0, last_xp INTEGER DEFAULT 0, last_seen INTEGER DEFAULT 0, PRIMARY KEY(guild,user));
      CREATE TABLE IF NOT EXISTS joins (guild TEXT, user TEXT, inviter TEXT, time INTEGER, PRIMARY KEY(guild,user));`);
  }
  get(guild, key, fallback = null) {
    const row = this.db
      .prepare("SELECT value FROM kv WHERE guild=? AND key=?")
      .get(guild, key);
    return row ? JSON.parse(row.value) : fallback;
  }
  set(guild, key, value) {
    this.db
      .prepare("INSERT OR REPLACE INTO kv VALUES (?,?,?)")
      .run(guild, key, JSON.stringify(value));
    return value;
  }
  delete(guild, key) {
    this.db.prepare("DELETE FROM kv WHERE guild=? AND key=?").run(guild, key);
  }
  config(guild) {
    return this.get(guild, "config", {
      welcome:
        "Welcome {user} to {server}! Read the rules and introduce yourself.",
      goodbye: "{name} left {server}.",
      automod: false,
      blockInvites: true,
      mentionLimit: 6,
      spamLimit: 6,
      blockedWords: [],
      leveling: true,
    });
  }
  configure(guild, patch) {
    return this.set(guild, "config", { ...this.config(guild), ...patch });
  }
  record(guild, user, actor, action, reason) {
    return Number(
      this.db
        .prepare(
          "INSERT INTO cases(guild,user,actor,action,reason,time) VALUES (?,?,?,?,?,?)",
        )
        .run(guild, user, actor, action, reason, Date.now()).lastInsertRowid,
    );
  }
  cases(guild, user) {
    return this.db
      .prepare(
        "SELECT * FROM cases WHERE guild=? AND user=? ORDER BY id DESC LIMIT 15",
      )
      .all(guild, user);
  }
  message(guild, user, leveling, now = Date.now()) {
    this.db
      .prepare(
        "INSERT INTO activity VALUES (?,?,?,1) ON CONFLICT(guild,user,day) DO UPDATE SET messages=messages+1",
      )
      .run(guild, user, new Date(now).toISOString().slice(0, 10));
    this.db
      .prepare("INSERT OR IGNORE INTO members(guild,user) VALUES (?,?)")
      .run(guild, user);
    const old = this.member(guild, user);
    const xp = leveling && now - old.last_xp >= 60000 ? 15 : 0;
    this.db
      .prepare(
        "UPDATE members SET xp=xp+?,last_xp=?,last_seen=? WHERE guild=? AND user=?",
      )
      .run(xp, xp ? now : old.last_xp, now, guild, user);
    return this.member(guild, user);
  }
  member(guild, user) {
    return (
      this.db
        .prepare("SELECT * FROM members WHERE guild=? AND user=?")
        .get(guild, user) || { xp: 0, last_seen: 0 }
    );
  }
  leaderboard(guild) {
    return this.db
      .prepare(
        "SELECT user,xp FROM members WHERE guild=? ORDER BY xp DESC LIMIT 10",
      )
      .all(guild);
  }
  analytics(guild, days, now = Date.now()) {
    const start = new Date(now - (days - 1) * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      ...this.db
        .prepare(
          "SELECT COALESCE(SUM(messages),0) messages,COUNT(DISTINCT user) active FROM activity WHERE guild=? AND day>=?",
        )
        .get(guild, start),
      daily: this.db
        .prepare(
          "SELECT day,SUM(messages) messages FROM activity WHERE guild=? AND day>=? GROUP BY day ORDER BY day",
        )
        .all(guild, start),
    };
  }
  prune(now = Date.now()) {
    this.db
      .prepare("DELETE FROM activity WHERE day<?")
      .run(new Date(now - 91 * 86400000).toISOString().slice(0, 10));
  }
  close() {
    if (this.db.isOpen) this.db.close();
  }
}
