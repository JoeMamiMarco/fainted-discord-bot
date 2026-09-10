import test from "node:test";
import assert from "node:assert/strict";
import { MentionReplies, localChat, withLocalAI } from "../src/ai-chat.js";
import { validatePatch } from "../src/feature-config.js";
import { validateEmbed } from "../src/presentation.js";
import { drawWinners } from "../src/features.js";
import { createDashboard } from "../src/dashboard-server.js";

test("mention replies require an explicit bot mention and ignore bots and webhooks", async () => {
  let count = 0;
  const replies = [];
  const handler = new MentionReplies(
    { config: () => ({ aiMentions: true }) },
    async (question) => {
      count++;
      assert.equal(question, "hello");
      return "Hello!";
    },
  );
  const m = {
    guild: { id: "g" },
    guildId: "g",
    author: { id: "u", bot: false },
    content: "hello",
    channel: { sendTyping: async () => {} },
    reply: async (p) => replies.push(p),
  };
  assert.equal(await handler.handle(m, "123"), false);
  await handler.handle(
    { ...m, content: "<@123> hello", author: { id: "bot", bot: true } },
    "123",
  );
  await handler.handle(
    { ...m, content: "<@123> hello", webhookId: "hook" },
    "123",
  );
  await handler.handle({ ...m, content: "<@!123> hello" }, "123");
  await handler.handle({ ...m, content: "<@123> hello" }, "123");
  assert.equal(count, 1);
  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0].allowedMentions, {
    parse: [],
    repliedUser: false,
  });
});
test("disabled mention replies make no model request", async () => {
  const handler = new MentionReplies(
    { config: () => ({ aiMentions: false }) },
    () => {
      throw Error("must not run");
    },
  );
  assert.equal(
    await handler.handle(
      {
        guild: {},
        guildId: "g",
        author: { bot: false },
        content: "<@123> hello",
      },
      "123",
    ),
    false,
  );
});
test("chat stays local even when a legacy paid provider is configured", async () => {
  let call;
  const reply = await localChat("hello", {
    env: { AI_PROVIDER: "openai", OPENAI_API_KEY: "unused" },
    fetchFn: async (url, options) => {
      call = { url, body: JSON.parse(options.body), headers: options.headers };
      return Response.json({ message: { content: "Hello" }, done: true });
    },
  });
  assert.equal(reply, "Hello");
  assert.match(call.url, /^http:\/\/127\.0\.0\.1:/);
  assert.equal(call.body.keep_alive, 0);
  assert.equal(call.body.options.num_gpu, 0);
  assert.equal(call.body.options.num_thread, 4);
  assert.equal(call.headers.Authorization, undefined);
});
test("AI concurrency limit releases after failure", async () => {
  let release;
  const busy = withLocalAI(() => new Promise((r) => (release = r)));
  await assert.rejects(
    withLocalAI(() => 1),
    /busy/,
  );
  release();
  await busy;
  await assert.rejects(
    withLocalAI(() => {
      throw Error("failed");
    }),
  );
  assert.equal(await withLocalAI(() => 42), 42);
});
test("settings reject unknown keys, invalid rewards, and invalid thresholds", () => {
  for (const patch of [
    { DISCORD_TOKEN: "bad" },
    { raidThreshold: 0 },
    { xpMultiplier: 99 },
    { blockedWords: [""] },
    { levelRewards: [{ at: -1, role: "bad" }] },
    { autoResponses: [{ trigger: "", reply: "x" }] },
  ])
    assert.throws(() => validatePatch(patch));
  assert.deepEqual(validatePatch({ aiMentions: true, inactiveAuto: false }), {
    aiMentions: true,
    inactiveAuto: false,
  });
});
test("giveaway draw has no duplicate winners and handles too few entrants", () => {
  assert.deepEqual(
    drawWinners(["a", "a", "b"], 9, () => 0),
    ["a", "b"],
  );
  assert.deepEqual(drawWinners([], 1), []);
});
test("embed builder enforces Discord sizes and HTTPS images", () => {
  assert.throws(() => validateEmbed({ title: "x".repeat(257) }));
  assert.throws(() =>
    validateEmbed({ title: "x", image: "javascript:alert(1)" }),
  );
  const embed = validateEmbed({
    title: "Welcome",
    description: "Hello",
  }).toJSON();
  assert.equal(embed.title, "Welcome");
  assert.equal(embed.color, 0xffffff);
});
test("local dashboard rejects missing authentication and cross-site changes", async (t) => {
  const controller = {
    state: { status: "offline" },
    history: [],
    snapshot: null,
    child: null,
    stop: async () => {},
    request: async () => ({ ok: true }),
  };
  const app = createDashboard({
    controller,
    port: 0,
    token: "known-test-session",
  });
  const url = new URL(await app.listen());
  url.hash = "";
  t.after(() => app.close());
  const origin = url.origin;
  assert.equal((await fetch(origin + "/api/state")).status, 401);
  assert.equal(
    (
      await fetch(origin + "/api/state", {
        headers: { Authorization: "Bearer known-test-session" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(origin + "/api/action", {
        method: "POST",
        headers: {
          Authorization: "Bearer known-test-session",
          "Content-Type": "application/json",
          Origin: "https://untrusted.example",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  const result = await fetch(origin + "/api/action", {
    method: "POST",
    headers: {
      Authorization: "Bearer known-test-session",
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ action: "snapshot" }),
  });
  assert.equal(result.status, 200);
});
