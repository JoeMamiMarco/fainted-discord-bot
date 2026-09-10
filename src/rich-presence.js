import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";

export function frame(opcode, payload) {
  const body = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(JSON.stringify(payload));
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
export function presenceActivity(state = {}, env = {}, started = Date.now()) {
  const base =
    "https://raw.githubusercontent.com/JoeMamiMarco/fainted-discord-bot/main/assets/";
  const image = (value, fallback) => {
    if (!value) return fallback;
    if (/^[a-z0-9_-]{1,100}$/.test(value)) return value;
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password)
      throw new Error(
        "Rich Presence artwork must use an uploaded asset key or HTTPS URL.",
      );
    return u.href;
  };
  return {
    type: 0,
    details: "seep dashboard",
    state: ["online", "limited"].includes(state.status)
      ? "Managing a Discord community"
      : "Designing a Discord community",
    timestamps: { start: Math.floor(started / 1000) },
    assets: {
      large_image: image(
        env.RICH_PRESENCE_LARGE_IMAGE,
        base + "seep-rich-presence-1024.png",
      ),
      large_text: "seep • Your community, connected",
      small_image: image(
        env.RICH_PRESENCE_SMALL_IMAGE,
        base + "seep-logo-1024.png",
      ),
      small_text: "seep",
    },
    instance: false,
  };
}
export class RichPresence {
  constructor({
    env = () => process.env,
    state = () => ({}),
    connect = createConnection,
  } = {}) {
    this.env = env;
    this.state = state;
    this.connect = connect;
    this.socket = null;
    this.ready = false;
    this.closed = false;
    this.connecting = false;
    this.started = Date.now();
    this.status = "Waiting for Discord desktop";
    this.last = "";
    this.pending = null;
  }
  start() {
    this.timer = setInterval(() => void this.tick(), 15000);
    this.timer.unref();
    void this.tick();
  }
  async tick() {
    if (this.closed) return;
    const e = this.env();
    if (e.RICH_PRESENCE_ENABLED === "false") {
      this.clear();
      this.status = "Disabled";
      return;
    }
    if (!/^\d{17,20}$/.test(e.DISCORD_CLIENT_ID || "")) {
      this.status = "Application ID needed";
      return;
    }
    if (this.ready) {
      this.publish();
      return;
    }
    if (this.connecting) return;
    this.connecting = true;
    try {
      for (let n = 0; n < 10 && !this.closed; n++) {
        const socket = await new Promise((resolve) => {
          const p = this.connect({ path: `\\\\?\\pipe\\discord-ipc-${n}` });
          const timeout = setTimeout(() => {
            p.destroy();
            resolve(null);
          }, 400);
          p.once("error", () => {
            clearTimeout(timeout);
            p.destroy();
            resolve(null);
          });
          p.once("connect", () => {
            clearTimeout(timeout);
            resolve(p);
          });
        });
        if (!socket) continue;
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        this.status = "Connecting to Discord desktop";
        socket.on("error", () => {
          this.status = "Discord desktop disconnected";
        });
        socket.on("close", () => {
          if (this.socket === socket) {
            this.socket = null;
            this.ready = false;
            this.last = "";
            this.pending = null;
          }
        });
        socket.on("data", (chunk) => this.receive(chunk));
        socket.write(frame(0, { v: 1, client_id: e.DISCORD_CLIENT_ID }));
        this.handshake = setTimeout(() => {
          if (!this.ready) socket.destroy();
        }, 7000);
        this.handshake.unref();
        return;
      }
      this.status = "Open Discord desktop to show Rich Presence";
    } finally {
      this.connecting = false;
    }
  }
  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > 1048576) {
      this.socket?.destroy();
      return;
    }
    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readUInt32LE(0),
        length = this.buffer.readUInt32LE(4);
      if (length > 1048576) {
        this.socket?.destroy();
        return;
      }
      if (this.buffer.length < length + 8) return;
      const body = this.buffer.subarray(8, length + 8);
      this.buffer = this.buffer.subarray(length + 8);
      if (opcode === 3) {
        this.socket?.write(frame(4, body));
        continue;
      }
      if (opcode === 2) {
        this.socket?.destroy();
        return;
      }
      if (opcode !== 1) continue;
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        continue;
      }
      if (data.evt === "READY") {
        clearTimeout(this.handshake);
        this.ready = true;
        this.publish();
      } else if (data.evt === "ERROR") {
        this.status =
          "Discord rejected the presence: " +
          String(data.data?.message || "check application settings").slice(
            0,
            180,
          );
        this.pending = null;
        this.last = "";
      } else if (data.cmd === "SET_ACTIVITY" && data.nonce === this.pending) {
        this.pending = null;
        this.status = "Rich Presence connected";
      }
    }
  }
  publish() {
    if (!this.ready || !this.socket || this.pending) return;
    try {
      const activity = presenceActivity(this.state(), this.env(), this.started),
        key = JSON.stringify(activity);
      if (key === this.last) return;
      this.last = key;
      this.pending = randomUUID();
      this.socket.write(
        frame(1, {
          cmd: "SET_ACTIVITY",
          args: { pid: process.pid, activity },
          nonce: this.pending,
        }),
      );
      this.status = "Updating Rich Presence";
    } catch (e) {
      this.status = e.message;
    }
  }
  clear() {
    if (this.ready && this.socket)
      this.socket.write(
        frame(1, {
          cmd: "SET_ACTIVITY",
          args: { pid: process.pid, activity: null },
          nonce: randomUUID(),
        }),
      );
    this.socket?.end();
    this.socket = null;
    this.ready = false;
    this.pending = null;
    this.last = "";
  }
  stop() {
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.handshake);
    this.clear();
  }
}
