import http from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canManage } from "./member-access.js";

const random = () => randomBytes(32).toString("hex");
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function createMemberDashboard({
  controller,
  chats,
  root,
  env = () => process.env,
  port = 11438,
  fetchFn = fetch,
} = {}) {
  const sessions = new Map(),
    flows = new Map(),
    pairs = new Map();
  const api = "https://discord.com/api/v10";
  let server;
  function config() {
    const e = env(),
      origin =
        e.MEMBER_DASHBOARD_ORIGIN ||
        `http://127.0.0.1:${server.address()?.port || port}`;
    const u = new URL(origin);
    if (
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash ||
      !(
        u.protocol === "https:" ||
        (u.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(u.hostname))
      )
    )
      throw new Error(
        "Member dashboard origin must be HTTPS, or localhost for local use.",
      );
    return {
      origin: u.origin,
      clientId: e.DISCORD_CLIENT_ID,
      secret: e.DISCORD_CLIENT_SECRET,
      redirect: u.origin + "/auth/callback",
      secure: u.protocol === "https:",
    };
  }
  function isOwner(session) {
    const id = env().SEEP_OWNER_ID;
    return /^\d{17,20}$/.test(id || "") && session?.user.id === id;
  }
  async function discord(path, token, options = {}) {
    const r = await fetchFn(api + path, {
      ...options,
      headers: { Authorization: "Bearer " + token, ...options.headers },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new Error(
        r.status === 401
          ? "Discord login expired. Sign in again."
          : "Discord could not verify your account or permissions. Try again shortly.",
      );
    return r.json();
  }
  function cookie(res, id, cfg) {
    res.setHeader(
      "Set-Cookie",
      `seep_member=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${cfg.secure ? "; Secure" : ""}`,
    );
  }
  function getSession(req) {
    const id = String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("seep_member="))
      ?.slice(12);
    const s = id ? sessions.get(hash(id)) : null;
    if (!s || s.expires < Date.now()) return null;
    return s;
  }
  async function access(s, guildId) {
    if (!/^\d{17,20}$/.test(guildId || ""))
      throw new Error("Choose a server first.");
    // Re-query Discord for every member action, including chat reads; revocation takes effect immediately.
    const guilds = await discord("/users/@me/guilds?limit=200", s.accessToken);
    const g = guilds.find((g) => g.id === guildId && canManage(g));
    if (!g)
      throw new Error("You no longer have permission to manage this server.");
    await controller.request("member-authorize", {
      guildId,
      userId: s.user.id,
    });
    return g;
  }
  server = http.createServer(async (req, res) => {
    let cfg;
    const send = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const redirect = (location) => {
      res.writeHead(302, { Location: location });
      res.end();
    };
    try {
      cfg = config();
      const u = new URL(req.url, cfg.origin),
        path = u.pathname;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      );
      if (req.headers.host !== new URL(cfg.origin).host)
        return send(403, { error: "Invalid dashboard host." });
      if (req.headers.origin && req.headers.origin !== cfg.origin)
        return send(403, { error: "Cross-site request refused." });
      if (
        req.method === "GET" &&
        [
          "/",
          "/app.js",
          "/style.css",
          "/conversations.js",
          "/seep-logo.png",
        ].includes(path)
      ) {
        let content;
        if (path === "/")
          content = readFileSync(join(root, "dashboard/index.html"), "utf8")
            .replace("<body>", '<body data-mode="member">')
            .replace(
              /<button id="(?:start|stop|restart)"[^>]*>[\s\S]*?<\/button\s*>/g,
              "",
            )
            .replace(
              '<button id="exit" class="text-button">Shut down dashboard ↗</button>',
              '<button id="exit" class="text-button">Log out</button>',
            );
        else
          content = readFileSync(
            join(
              root,
              path === "/seep-logo.png"
                ? "assets/seep-logo.png"
                : "dashboard" + path,
            ),
          );
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
        return;
      }
      if (req.method === "GET" && path === "/auth/login") {
        if (!cfg.clientId || !cfg.secret)
          return send(503, {
            error:
              "The owner must configure Discord login in the owner dashboard first.",
          });
        if (flows.size > 1000)
          return send(429, {
            error: "Too many login attempts. Try again later.",
          });
        const state = random(),
          binding = random(),
          pair = u.searchParams.get("pair");
        if (pair && !pairs.has(hash(pair)))
          throw new Error("This desktop sign-in request expired. Try again.");
        flows.set(hash(state), {
          expires: Date.now() + 600000,
          binding: hash(binding),
          pair: pair ? hash(pair) : null,
        });
        res.setHeader(
          "Set-Cookie",
          `seep_oauth=${binding}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600${cfg.secure ? "; Secure" : ""}`,
        );
        const target = new URL("https://discord.com/oauth2/authorize");
        target.search = new URLSearchParams({
          client_id: cfg.clientId,
          redirect_uri: cfg.redirect,
          response_type: "code",
          scope: "identify guilds",
          state,
        }).toString();
        return redirect(target.href);
      }
      if (req.method === "GET" && path === "/auth/callback") {
        const key = hash(u.searchParams.get("state") || ""),
          flow = flows.get(key);
        flows.delete(key);
        const binding = String(req.headers.cookie || "")
          .split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("seep_oauth="))
          ?.slice(11);
        if (
          !flow ||
          flow.expires < Date.now() ||
          !binding ||
          hash(binding) !== flow.binding
        )
          throw new Error(
            "Discord login could not be verified. Start login again.",
          );
        if (!u.searchParams.get("code"))
          throw new Error("Discord login was cancelled.");
        const response = await fetchFn("https://discord.com/api/oauth2/token", {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: cfg.clientId,
            client_secret: cfg.secret,
            grant_type: "authorization_code",
            code: u.searchParams.get("code"),
            redirect_uri: cfg.redirect,
          }),
        });
        if (!response.ok)
          throw new Error(
            "Discord login failed. Check the client secret and registered redirect URL in owner settings.",
          );
        const tokens = await response.json(),
          user = await discord("/users/@me", tokens.access_token),
          id = random();
        const s = {
          user: { id: user.id, username: user.global_name || user.username },
          accessToken: tokens.access_token,
          csrf: random(),
          expires:
            Date.now() +
            Math.min(Number(tokens.expires_in) || 3600, 28800) * 1000,
        };
        sessions.set(hash(id), s);
        cookie(res, id, cfg);
        if (flow.pair) {
          const pair = pairs.get(flow.pair);
          if (pair && pair.expires > Date.now()) pair.session = id;
        }
        return redirect("/#overview");
      }
      if (req.method === "GET" && path === "/api/session") {
        const s = getSession(req);
        return send(
          200,
          s
            ? { user: s.user, csrf: s.csrf, owner: isOwner(s) }
            : { user: null, configured: !!cfg.secret },
        );
      }
      let body = {};
      if (req.method === "POST") {
        if (
          req.headers.origin !== cfg.origin ||
          !String(req.headers["content-type"]).startsWith("application/json")
        )
          return send(403, { error: "Invalid dashboard request." });
        let text = "",
          bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > (path === "/api/chats" ? 12000000 : 75000))
            return send(413, { error: "Request too large." });
          text += chunk;
        }
        body = JSON.parse(text || "{}");
      }
      if (req.method === "POST" && path === "/api/pair") {
        if (!cfg.secret)
          return send(503, {
            error: "Configure Discord login in the owner dashboard first.",
          });
        if (pairs.size > 1000)
          return send(429, { error: "Too many sign-in attempts." });
        const code = random();
        pairs.set(hash(code), { expires: Date.now() + 600000 });
        return send(200, {
          code,
          url: cfg.origin + "/auth/login?pair=" + code,
        });
      }
      if (req.method === "POST" && path === "/api/pair-status") {
        const key = hash(String(body.code || "")),
          pair = pairs.get(key);
        if (!pair || pair.expires < Date.now())
          throw new Error("Sign-in request expired.");
        if (!pair.session) return send(200, { pending: true });
        cookie(res, pair.session, cfg);
        pairs.delete(key);
        return send(200, { ready: true });
      }
      const s = getSession(req);
      if (!s) return send(401, { error: "Sign in with Discord to continue." });
      if (req.method === "POST" && req.headers["x-csrf-token"] !== s.csrf)
        return send(403, {
          error: "Refresh this dashboard before continuing.",
        });
      if (req.method === "POST" && path === "/api/logout") {
        for (const [id, value] of sessions)
          if (value === s) sessions.delete(id);
        res.setHeader(
          "Set-Cookie",
          "seep_member=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        );
        return send(200, { ok: true });
      }
      if (path === "/api/owner-state" || path === "/api/owner-control") {
        if (!isOwner(s))
          return send(403, {
            error: "Only the seep owner can control the bot.",
          });
        if (req.method === "GET" && path === "/api/owner-state")
          return send(200, {
            status: controller.state.status,
            active: !!controller.child,
            pending: controller.pending?.size || 0,
            message: controller.state.message,
            ai: controller.state.ai,
          });
        if (req.method === "POST" && path === "/api/owner-control") {
          if (!["start", "stop", "restart"].includes(body.action))
            return send(400, { error: "Unknown bot control." });
          if (body.action !== "start" && body.confirm !== true)
            return send(400, {
              error:
                "Confirm stopping the bot; active requests will be interrupted.",
            });
          if (body.action !== "start") await controller.stop();
          if (body.action !== "stop") controller.start();
          return send(200, { ok: true, status: controller.state.status });
        }
        return send(405, { error: "Method not allowed." });
      }
      if (req.method === "GET" && path === "/api/guilds") {
        const guilds = await discord(
          "/users/@me/guilds?limit=200",
          s.accessToken,
        );
        const botOnline = ["online", "limited"].includes(
          controller.state.status,
        );
        const installed = botOnline ? await controller.request("guilds") : [];
        return send(
          200,
          guilds.filter(canManage).map((g) => ({
            id: g.id,
            name: g.name,
            icon: g.icon,
            installed: botOnline ? installed.includes(g.id) : null,
            invite: `https://discord.com/oauth2/authorize?client_id=${cfg.clientId}&scope=bot%20applications.commands&permissions=0&guild_id=${g.id}&disable_guild_select=true`,
          })),
        );
      }
      const guildId =
        req.method === "GET" ? u.searchParams.get("guildId") : body.guildId;
      await access(s, guildId);
      const request = (action, payload = {}) =>
        controller.request("member-action", {
          guildId,
          userId: s.user.id,
          action,
          payload,
        });
      if (req.method === "GET" && path === "/api/state") {
        const snapshot = await request("snapshot");
        return send(200, {
          status: controller.state.status,
          onlineSince: controller.state.onlineSince,
          warning: controller.state.warning,
          snapshot,
        });
      }
      if (req.method === "POST" && path === "/api/action")
        return send(200, await request(body.action, body.payload || {}));
      if (path === "/api/chats") {
        if (req.method === "GET")
          return send(
            200,
            u.searchParams.get("id")
              ? chats.get(s.user.id, guildId, u.searchParams.get("id"))
              : chats.list(s.user.id, guildId),
          );
        if (req.method === "POST") {
          if (body.action === "create")
            return send(200, chats.create(s.user.id, guildId, body.kind));
          if (body.action === "delete")
            return send(200, chats.remove(s.user.id, guildId, body.id));
          if (body.action === "send")
            return send(
              200,
              await chats.send(
                s.user.id,
                guildId,
                body.id,
                body.text,
                request,
                { ai: body.ai, screenshot: body.screenshot },
              ),
            );
        }
      }
      send(404, { error: "Not available in the member dashboard." });
    } catch (e) {
      send(400, { error: e.message });
    }
  });
  const cleanup = setInterval(() => {
    for (const map of [sessions, flows, pairs])
      for (const [key, item] of map)
        if (item.expires < Date.now()) map.delete(key);
  }, 60000);
  cleanup.unref();
  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, env().MEMBER_DASHBOARD_BIND || "127.0.0.1", () =>
          resolve(config().origin),
        );
      }),
    close: () => {
      clearInterval(cleanup);
      sessions.clear();
      server.closeAllConnections();
      server.close();
    },
  };
}
