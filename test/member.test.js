import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Chats } from "../src/chats.js";
import { createMemberDashboard } from "../src/member-server.js";
import { canManage, authorizeAction } from "../src/member-access.js";
import { MentionReplies, REPLY_HINT, reasoningBudget } from "../src/ai-chat.js";
import { Features } from "../src/features.js";

test("reply conversations use bot context, accept immediate follow-ups, and ignore unrelated replies", async () => {
  const sent = [],
    questions = [],
    handler = new MentionReplies(
      { config: () => ({ aiMentions: true }) },
      async (q) => {
        questions.push(q);
        return "Here is the answer.";
      },
    );
  const base = {
    guild: { id: "g" },
    guildId: "g",
    channelId: "c",
    author: { id: "u", bot: false },
    channel: { sendTyping: async () => {} },
    reply: async (p) => sent.push(p),
  };
  await handler.handle({ ...base, content: "<@123> help" }, "123");
  await handler.handle(
    {
      ...base,
      content: "Explain step two",
      reference: { messageId: "first", channelId: "c" },
      fetchReference: async () => ({
        author: { id: "123", bot: true },
        content: "Step one. Step two.\n" + REPLY_HINT,
      }),
    },
    "123",
  );
  assert.equal(questions.length, 2);
  assert.match(questions[1], /Step one.*Step two/);
  assert.match(questions[1], /Explain step two/);
  assert.ok(
    sent.every(
      (x) => x.content.endsWith(REPLY_HINT) && x.content.length <= 2000,
    ),
  );
  assert.equal(
    await handler.handle(
      {
        ...base,
        content: "unrelated",
        reference: { messageId: "x" },
        fetchReference: async () => ({ author: { id: "other" } }),
      },
      "123",
    ),
    false,
  );
  assert.equal(
    await handler.handle(
      {
        ...base,
        content: "deleted",
        reference: { messageId: "x" },
        fetchReference: async () => {
          throw Error("deleted");
        },
      },
      "123",
    ),
    false,
  );
});

test("complex answers get more capacity, keep CPU limits, and split safely for Discord", async () => {
  assert.equal(reasoningBudget("hello").num_ctx, 4096);
  assert.equal(
    reasoningBudget("Debug this complex permission conflict").num_ctx,
    8192,
  );
  assert.equal(reasoningBudget("complex").num_thread, 4);
  const sent = [],
    handler = new MentionReplies({ config: () => ({}) }, async () =>
      "a".repeat(4200),
    );
  await handler.handle(
    {
      guild: {},
      guildId: "g",
      author: { id: "u" },
      content: "<@123> hello",
      channel: { sendTyping: async () => {} },
      reply: async (x) => sent.push(x),
    },
    "123",
  );
  assert.equal(sent.length, 3);
  assert.ok(
    sent.every(
      (x) => x.content.length <= 2000 && x.content.endsWith(REPLY_HINT),
    ),
  );
});

test("saved chats are isolated by user and guild and preserve conversation context", async () => {
  const store = new Chats(":memory:");
  try {
    const chat = store.create("alice", "guild1");
    assert.throws(() => store.get("bob", "guild1", chat.id), /not found/);
    assert.throws(() => store.get("alice", "guild2", chat.id), /not found/);
    assert.throws(() => store.remove("bob", "guild1", chat.id), /not found/);
    await store.send(
      "alice",
      "guild1",
      chat.id,
      "First question",
      async () => ({ reply: "First answer" }),
    );
    await store.send("alice", "guild1", chat.id, "Follow up", async (a, p) => {
      assert.match(p.question, /First answer/);
      return { reply: "Second answer" };
    });
    assert.equal(store.get("alice", "guild1", chat.id).messages.length, 4);
    assert.equal(store.list("alice", "guild1")[0].title, "First question");
    assert.deepEqual(store.list("bob", "guild1"), []);
  } finally {
    store.close();
  }
});

test("server manager permission and action permissions are enforced on the bot", async () => {
  assert.equal(canManage({ permissions: "32" }), true);
  assert.equal(canManage({ permissions: "8" }), true);
  assert.equal(canManage({ permissions: "0" }), false);
  let allowed = false;
  const g = {
    roles: { fetch: async () => {} },
    members: {
      fetch: async (options) => {
        assert.equal(options.force, true);
        return { permissions: { has: () => allowed } };
      },
    },
  };
  await assert.rejects(authorizeAction(g, "u", "chat"), /Manage Server/);
  allowed = true;
  await authorizeAction(g, "u", "build");
  await assert.rejects(authorizeAction(g, "u", "stop"), /not available/);
});

test("layout preview tokens are bound to their creator and guild", async () => {
  const g = { id: "g" },
    client = {
      guilds: {
        cache: new Map([
          ["g", g],
          ["other", { id: "other" }],
        ]),
      },
    },
    store = { config: () => ({}), set: () => {}, get: () => null },
    bot = { serial: async (_, fn) => fn() };
  const f = new Features(client, store, bot, "g"),
    other = new Features(client, store, bot, "other");
  const draft = await f.action(
    "plan",
    { description: "A gaming community", ai: false },
    "alice",
  );
  await assert.rejects(
    f.action("build", { token: draft.token }, "bob"),
    /fresh preview/,
  );
  await assert.rejects(
    other.action("build", { token: draft.token }, "alice"),
    /fresh preview/,
  );
  assert.ok(f.plans.has(draft.token));
});

test("member OAuth requires state binding, filters guilds, blocks owner controls and revoked permissions", async (t) => {
  const chats = new Chats(":memory:"),
    gid = "123456789012345678",
    calls = [];
  let permitted = true;
  const controller = {
    state: { status: "online" },
    request: async (a, p) => {
      calls.push({ a, p });
      if (a === "guilds") return [gid];
      if (a === "member-authorize") return { allowed: true };
      if (a === "member-action") {
        if (p.action === "stop") throw Error("This action is not available.");
        return p.action === "chat"
          ? { reply: "hello" }
          : { server: { id: gid } };
      }
      throw Error("Unexpected owner action");
    },
  };
  const fetchFn = async (url) => {
    if (String(url).endsWith("/oauth2/token"))
      return Response.json({
        access_token: "mock-access-token",
        expires_in: 3600,
      });
    if (String(url).includes("/users/@me/guilds"))
      return Response.json([
        { id: gid, name: "Managed", permissions: permitted ? "32" : "0" },
        { id: "223456789012345678", name: "Read only", permissions: "0" },
      ]);
    return Response.json({ id: "333456789012345678", username: "Alice" });
  };
  const app = createMemberDashboard({
    controller,
    chats,
    root: fileURLToPath(new URL("../", import.meta.url)),
    env: () => ({
      DISCORD_CLIENT_ID: "999456789012345678",
      DISCORD_CLIENT_SECRET: "test-secret",
    }),
    port: 0,
    fetchFn,
  });
  const origin = await app.listen();
  t.after(() => {
    app.close();
    chats.close();
  });
  const headers = { "Content-Type": "application/json", Origin: origin };
  const html = await (await fetch(origin)).text();
  assert.match(html, /data-mode="member"/);
  assert.doesNotMatch(html, /id="(?:start|stop|restart)"/);
  assert.equal((await fetch(origin + "/api/state")).status, 401);
  assert.equal(
    (
      await fetch(origin + "/api/pair", {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
    403,
  );
  let r = await fetch(origin + "/auth/login", { redirect: "manual" }),
    target = new URL(r.headers.get("location")),
    binding = r.headers.getSetCookie()[0].split(";")[0];
  assert.equal(target.searchParams.get("scope"), "identify guilds");
  assert.equal(
    (
      await fetch(origin + "/auth/callback?code=x&state=forged", {
        headers: { Cookie: binding },
        redirect: "manual",
      })
    ).status,
    400,
  );
  r = await fetch(
    origin + "/auth/callback?code=x&state=" + target.searchParams.get("state"),
    { headers: { Cookie: binding }, redirect: "manual" },
  );
  assert.equal(r.status, 302);
  const cookie = r.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const auth = { Cookie: cookie.split(";")[0] };
  const session = await (
    await fetch(origin + "/api/session", { headers: auth })
  ).json();
  assert.equal(session.user.username, "Alice");
  assert.equal(session.accessToken, undefined);
  const guilds = await (
    await fetch(origin + "/api/guilds", { headers: auth })
  ).json();
  assert.equal(guilds.length, 1);
  assert.equal(guilds[0].id, gid);
  const post = async (path, data, csrf = session.csrf) =>
    fetch(origin + "/api/" + path, {
      method: "POST",
      headers: { ...headers, ...auth, "X-CSRF-Token": csrf },
      body: JSON.stringify({ guildId: gid, ...data }),
    });
  assert.equal((await post("action", { action: "chat" }, "bad")).status, 403);
  assert.equal((await post("control", { action: "stop" })).status, 404);
  assert.equal((await post("action", { action: "stop" })).status, 400);
  assert.ok(calls.every((x) => x.a !== "stop"));
  const chat = await (await post("chats", { action: "create" })).json();
  assert.ok(chat.id);
  permitted = false;
  assert.equal(
    (
      await fetch(origin + "/api/chats?guildId=" + gid + "&id=" + chat.id, {
        headers: auth,
      })
    ).status,
    400,
  );
  assert.equal(
    (await post("action", { action: "build", payload: { token: "stale" } }))
      .status,
    400,
  );
});
