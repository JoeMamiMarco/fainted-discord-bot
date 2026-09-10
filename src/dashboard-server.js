import http from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { once } from "node:events";
import { explainError } from "./status.js";
import { Chats } from "./chats.js";
import { createMemberDashboard } from "./member-server.js";
import { RichPresence } from "./rich-presence.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export class Controller {
  constructor() {
    this.child = null;
    this.pending = new Map();
    this.history = [];
    this.state = {
      status: "offline",
      ai: "Stopped",
      message: "Ready when you are",
      onlineSince: null,
      warning: "",
      error: "",
    };
    this.snapshot = null;
    this.stopping = false;
    this.timer = null;
  }
  log(message) {
    const env = readEnv();
    for (const [key, value] of Object.entries(env))
      if (/TOKEN|API_KEY|SECRET/.test(key) && value.length > 6)
        message = message.replaceAll(value, "[hidden]");
    this.history.push({ time: Date.now(), message });
    this.history = this.history.slice(-150);
    try {
      mkdirSync(join(root, "runtime"), { recursive: true });
      appendFileSync(
        join(root, "runtime", "seep-dashboard.log"),
        `${new Date().toISOString()} ${message}\n`,
      );
    } catch {}
  }
  event(line) {
    if (!line.startsWith("@@SEEP ")) {
      this.log(line);
      return;
    }
    let e;
    try {
      e = JSON.parse(line.slice(7));
    } catch {
      return;
    }
    if (e.type === "response") {
      const waiting = this.pending.get(e.id);
      if (waiting) {
        clearTimeout(waiting.timer);
        this.pending.delete(e.id);
        e.error
          ? waiting.reject(new Error(e.error))
          : waiting.resolve(e.result);
      }
      return;
    }
    if (e.type === "online") {
      clearTimeout(this.timer);
      this.state = {
        ...this.state,
        status: e.limited ? "limited" : "online",
        bot: e.bot,
        server: e.server,
        onlineSince: Date.now(),
        message: "Connected to Discord",
      };
      void this.request("snapshot")
        .then((x) => (this.snapshot = x))
        .catch((e) => this.log(e.message));
    }
    if (e.type === "phase") this.state.message = e.message;
    if (e.type === "warning") this.state.warning = e.message;
    if (e.type === "error") {
      this.state.error = e.message;
      this.state.status = "error";
    }
    if (e.type === "ai") this.state.ai = e.message;
    if (e.type === "stats") {
      this.state.ping = e.ping;
      this.state.memory = e.memory;
    }
    if (e.type === "reconnecting") this.state.status = "reconnecting";
    if (e.type === "resumed") this.state.status = "online";
    if (e.message) this.log(e.message);
  }
  start(mode = "start") {
    if (this.child)
      throw new Error("A task is already running. Stop it first.");
    this.stopping = false;
    this.state = {
      status: "starting",
      message:
        mode === "start" ? "Connecting to Discord..." : "Working on " + mode,
      ai: "Checking...",
      warning: "",
      error: "",
      onlineSince: null,
    };
    const p = spawn(
      process.execPath,
      ["--env-file-if-exists=.env", "src/desktop.js", mode, "--panel-mode"],
      {
        cwd: root,
        env: { ...process.env, ...readEnv(), AI_PROVIDER: "ollama" },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    this.child = p;
    p.stdin.on("error", () => {});
    createInterface({ input: p.stdout }).on("line", (line) => this.event(line));
    createInterface({ input: p.stderr }).on("line", (line) => this.log(line));
    p.once("error", (e) => {
      this.state.error = explainError(e);
      this.log(this.state.error);
    });
    p.once("close", (code) => {
      clearTimeout(this.timer);
      if (this.child !== p) return;
      this.child = null;
      for (const x of this.pending.values()) {
        clearTimeout(x.timer);
        x.reject(new Error("The bot stopped before the request finished."));
      }
      this.pending.clear();
      this.state.status =
        this.state.error && !this.stopping ? "error" : "offline";
      this.state.ai = "Stopped";
      this.state.onlineSince = null;
      if (!this.state.error)
        this.state.message = this.stopping
          ? "Bot stopped. You can start it again."
          : code
            ? "The task ended. Check activity."
            : "Task complete.";
      this.stopping = false;
      this.log(this.state.message);
    });
    if (mode === "start")
      this.timer = setTimeout(() => {
        this.state.error =
          "Startup took too long. Check your connection and bot settings.";
        void this.stop();
      }, 90000);
    this.log("Starting " + mode + "...");
    return this.state;
  }
  async stop() {
    if (!this.child) return;
    this.stopping = true;
    this.state.status = "stopping";
    this.state.message = "Disconnecting and closing local AI...";
    const p = this.child;
    const closed = once(p, "close");
    p.stdin.write("stop\n");
    const timer = setTimeout(() => {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(p.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      killer.on("error", () => {});
    }, 8000);
    await closed;
    clearTimeout(timer);
  }
  request(action, payload = {}) {
    if (!this.child || !["online", "limited"].includes(this.state.status))
      return Promise.reject(
        new Error("Start the bot and wait until it is online."),
      );
    const id = randomUUID();
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "The request timed out. Check Activity before retrying an action.",
          ),
        );
      }, 300000);
      this.pending.set(id, { resolve: resolveRequest, reject, timer });
      this.child.stdin.write(
        "@@REQUEST " + JSON.stringify({ id, action, payload }) + "\n",
      );
    });
  }
}
function readEnv() {
  if (!existsSync(join(root, ".env"))) return {};
  return Object.fromEntries(
    readFileSync(join(root, ".env"), "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [
          l.slice(0, i),
          l
            .slice(i + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}
function credentials() {
  const env = readEnv();
  return {
    configured: !!env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID || "",
    guildId: env.DISCORD_GUILD_ID || "",
  };
}
function saveCredentials(data) {
  if (!/^\d{17,20}$/.test(data.clientId) || !/^\d{17,20}$/.test(data.guildId))
    throw new Error("Application ID and server ID must be 17–20 digits.");
  if (data.token && !/^[\w.-]{20,200}$/.test(data.token))
    throw new Error("Paste a valid bot token without spaces.");
  const path = join(root, ".env"),
    lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const values = {
    DISCORD_CLIENT_ID: data.clientId,
    DISCORD_GUILD_ID: data.guildId,
    AI_PROVIDER: "ollama",
  };
  if (data.token) values.DISCORD_TOKEN = data.token;
  const kept = lines.filter(
    (l) => !Object.keys(values).some((k) => l.startsWith(k + "=")),
  );
  writeFileSync(
    path,
    [...kept, ...Object.entries(values).map(([k, v]) => `${k}=${v}`)].join(
      "\n",
    ),
  );
}
export function createDashboard({
  controller = new Controller(),
  token = randomBytes(32).toString("hex"),
  port = 11437,
} = {}) {
  let stopping = false;
  const chats = new Chats(join(root, "data", "chats.sqlite"));
  const presence = new RichPresence({
    env: readEnv,
    state: () => controller.state,
  });
  const server = http.createServer(async (req, res) => {
    const host = `127.0.0.1:${server.address().port}`,
      origin = `http://${host}`;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    const send = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.headers.host !== host)
      return send(403, { error: "Use the dashboard's local address." });
    const path = new URL(req.url, origin).pathname;
    if (
      req.method === "GET" &&
      [
        "/",
        "/app.js",
        "/conversations.js",
        "/style.css",
        "/seep-logo.png",
      ].includes(path)
    ) {
      const file =
        path === "/"
          ? "dashboard/index.html"
          : path === "/seep-logo.png"
            ? "assets/seep-logo.png"
            : "dashboard" + path;
      try {
        const content = readFileSync(join(root, file));
        res.writeHead(200, {
          "Content-Type": path.endsWith(".js")
            ? "text/javascript"
            : path.endsWith(".css")
              ? "text/css"
              : path.endsWith(".png")
                ? "image/png"
                : "text/html",
        });
        res.end(content);
      } catch {
        send(404, { error: "Dashboard file missing." });
      }
      return;
    }
    const supplied = Buffer.from(
        String(req.headers.authorization || "").replace(/^Bearer /, ""),
      ),
      expected = Buffer.from(token);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return send(401, {
        error: "Open seep dashboard.exe to connect to this dashboard.",
      });
    if (req.headers.origin && req.headers.origin !== origin)
      return send(403, {
        error: "This request must come from your local dashboard.",
      });
    try {
      if (req.method === "GET" && path === "/api/state")
        return send(200, {
          ...controller.state,
          presence: presence.status,
          presenceEnabled: readEnv().RICH_PRESENCE_ENABLED !== "false",
          active: !!controller.child,
          history: controller.history,
          credentials: credentials(),
          snapshot: controller.snapshot,
        });
      if (req.method === "GET" && path === "/api/oauth") {
        const e = readEnv();
        return send(200, {
          configured: !!e.DISCORD_CLIENT_SECRET,
          origin: e.MEMBER_DASHBOARD_ORIGIN || "http://127.0.0.1:11438",
          redirect:
            (e.MEMBER_DASHBOARD_ORIGIN || "http://127.0.0.1:11438") +
            "/auth/callback",
        });
      }
      if (req.method === "GET" && path === "/api/chats") {
        const u = new URL(req.url, origin),
          g = readEnv().DISCORD_GUILD_ID || "local";
        return send(
          200,
          u.searchParams.get("id")
            ? chats.get("owner", g, u.searchParams.get("id"))
            : chats.list("owner", g),
        );
      }
      if (
        req.method !== "POST" ||
        req.headers.origin !== origin ||
        !String(req.headers["content-type"]).startsWith("application/json")
      )
        return send(403, { error: "Invalid local dashboard request." });
      let bytes = 0,
        body = "";
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 75000) {
          send(413, { error: "Request is too large." });
          req.destroy();
          return;
        }
        body += chunk;
      }
      const data = JSON.parse(body || "{}");
      if (path === "/api/presence") {
        if (typeof data.enabled !== "boolean")
          throw new Error("Choose whether Rich Presence is enabled.");
        const file = join(root, ".env"),
          lines = existsSync(file)
            ? readFileSync(file, "utf8").split(/\r?\n/)
            : [];
        writeFileSync(
          file,
          [
            ...lines.filter((l) => !l.startsWith("RICH_PRESENCE_ENABLED=")),
            "RICH_PRESENCE_ENABLED=" + data.enabled,
          ].join("\n"),
        );
        await presence.tick();
        return send(200, {
          message: data.enabled
            ? "Rich Presence enabled."
            : "Rich Presence disabled.",
        });
      }
      if (path === "/api/oauth") {
        const values = {};
        if (data.secret) {
          if (!/^[\w.-]{20,200}$/.test(data.secret))
            throw new Error("Enter a valid OAuth2 client secret.");
          values.DISCORD_CLIENT_SECRET = data.secret;
        }
        const u = new URL(data.origin || "http://127.0.0.1:11438");
        if (
          u.pathname !== "/" ||
          u.search ||
          u.hash ||
          u.username ||
          u.password ||
          !(
            u.protocol === "https:" ||
            (u.protocol === "http:" &&
              ["127.0.0.1", "localhost"].includes(u.hostname))
          )
        )
          throw new Error("Use an HTTPS origin or localhost.");
        values.MEMBER_DASHBOARD_ORIGIN = u.origin;
        const file = join(root, ".env"),
          lines = existsSync(file)
            ? readFileSync(file, "utf8").split(/\r?\n/)
            : [];
        writeFileSync(
          file,
          [
            ...lines.filter(
              (l) => !Object.keys(values).some((k) => l.startsWith(k + "=")),
            ),
            ...Object.entries(values).map(([k, v]) => k + "=" + v),
          ].join("\n"),
        );
        return send(200, { saved: true });
      }
      if (path === "/api/chats") {
        const g = readEnv().DISCORD_GUILD_ID || "local";
        if (data.action === "create")
          return send(200, chats.create("owner", g, data.kind));
        if (data.action === "delete")
          return send(200, chats.remove("owner", g, data.id));
        if (data.action === "send")
          return send(
            200,
            await chats.send(
              "owner",
              g,
              data.id,
              data.text,
              (a, p) => controller.request(a, p),
              { ai: data.ai },
            ),
          );
        throw new Error("Unknown chat action.");
      }
      if (path === "/api/credentials") {
        if (controller.child)
          throw new Error("Stop the bot before changing its login settings.");
        saveCredentials(data);
        return send(200, { saved: true });
      }
      if (path === "/api/control") {
        if (data.action === "start") controller.start();
        else if (data.action === "stop") await controller.stop();
        else if (data.action === "restart") {
          await controller.stop();
          controller.start();
        } else if (["setup", "test-ai", "register"].includes(data.action))
          controller.start(data.action);
        else if (data.action === "shutdown") {
          send(200, { message: "Dashboard closed. Bot and AI are stopping." });
          void close();
          return;
        } else throw new Error("Unknown control.");
        return send(200, { ok: true });
      }
      if (path === "/api/action") {
        const result = await controller.request(
          data.action,
          data.payload || {},
        );
        if (data.action === "snapshot") controller.snapshot = result;
        else if (data.action === "settings" && controller.snapshot)
          controller.snapshot.config = result;
        return send(200, result);
      }
      send(404, { error: "Not found" });
    } catch (e) {
      send(400, { error: explainError(e) });
    }
  });
  async function close() {
    if (stopping) return;
    stopping = true;
    presence.stop();
    await controller.stop();
    memberApp?.close();
    chats.close();
    server.closeAllConnections();
    server.close();
  }
  let memberApp = null;
  return {
    server,
    controller,
    token,
    close,
    startPresence: () => presence.start(),
    startMembers: async () => {
      memberApp = createMemberDashboard({
        controller,
        chats,
        root,
        env: readEnv,
      });
      return memberApp.listen();
    },
    listen: () =>
      new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () =>
          resolveListen(`http://127.0.0.1:${server.address().port}/#${token}`),
        );
      }),
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createDashboard();
  try {
    const url = await app.listen();
    await app.startMembers();
    app.startPresence();
    mkdirSync(join(root, "runtime"), { recursive: true });
    writeFileSync(
      join(root, "runtime", "dashboard-session.json"),
      JSON.stringify({ url, pid: process.pid }),
    );
    console.log("@@DASHBOARD " + url);
    const io = createInterface({ input: process.stdin });
    io.on("line", (line) => {
      if (line.trim() === "stop") void app.close();
    });
    io.on("close", () => {
      if (process.argv.includes("--panel-mode")) void app.close();
    });
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => void app.close());
    app.server.on("close", () => process.exit(0));
  } catch (e) {
    console.error(
      e.code === "EADDRINUSE"
        ? "seep dashboard is already open. Use its existing window."
        : explainError(e),
    );
    process.exit(1);
  }
}
