import test from "node:test";
import assert from "node:assert/strict";
import {
  CodingAssistant,
  redactCode,
  readCodeAttachment,
} from "../src/coding.js";
import {
  cleanTemplate,
  portable,
  preset,
  Templates,
  templateThemes,
} from "../src/templates.js";
import { Store } from "../src/store.js";
import { codeCompletion } from "../src/code-provider.js";

test("coding context is opt-in, isolated, expiring and deletable without resetting quotas", async () => {
  let now = 100000,
    prompts = [];
  const service = new CodingAssistant(
    async (p) => {
      prompts.push(p);
      return "```python\nprint('ok')\n```";
    },
    () => now,
  );
  await service.run("g:a", {
    task: "generate",
    prompt: "Original unique context",
    remember: true,
  });
  now += 11000;
  await service.run("g:b", {
    task: "explain",
    prompt: "Another user",
    remember: true,
  });
  assert.ok(!prompts.at(-1).includes("Original unique"));
  await service.run("g:a", {
    task: "debug",
    prompt: "Follow up",
    remember: true,
  });
  assert.ok(prompts.at(-1).includes("Original unique"));
  service.reset("g:a");
  now += 11000;
  await service.run("g:a", {
    task: "test",
    prompt: "New question",
    remember: true,
  });
  assert.ok(!prompts.at(-1).includes("Follow up"));
  now += 31 * 60000;
  await service.run("g:a", {
    task: "review",
    prompt: "After expiry",
    remember: true,
  });
  assert.ok(!prompts.at(-1).includes("New question"));
  assert.equal(service.usage.get("g:a").count, 4);
});
test("coding rejects oversized input, invalid tasks and quota abuse; failures release concurrency", async () => {
  let now = 100000;
  const service = new CodingAssistant(
    async () => "ok",
    () => now,
  );
  await assert.rejects(
    service.run("a", { task: "execute", prompt: "rm -rf" }),
    /Choose a coding/,
  );
  await assert.rejects(
    service.run("a", { task: "review", prompt: "x".repeat(16001) }),
    /16,000/,
  );
  for (let i = 0; i < 20; i++) {
    await service.run("a", { task: "review", prompt: "example" });
    now += 11000;
  }
  service.reset("a");
  await assert.rejects(
    service.run("a", { task: "review", prompt: "example" }),
    /20 requests/,
  );
  const failing = new CodingAssistant(
    async () => {
      throw Error("unavailable");
    },
    () => now,
  );
  await assert.rejects(
    failing.run("a", { task: "review", prompt: "x" }),
    /unavailable/,
  );
  assert.equal(failing.pending.size, 0);
});
test("secret patterns are redacted and untrusted attachment destinations rejected", async () => {
  assert.ok(
    !redactCode('token="very-secret-value"').includes("very-secret-value"),
  );
  await assert.rejects(
    readCodeAttachment({ name: "code.py", size: 10, url: "http://127.0.0.1/" }),
    /Discord-uploaded/,
  );
  await assert.rejects(
    readCodeAttachment({
      name: "program.exe",
      size: 10,
      url: "https://cdn.discordapp.com/a",
    }),
    /text\/code/,
  );
});
test("all starters round-trip; dangerous and unsupported template fields are rejected", () => {
  for (const theme of Object.keys(templateThemes)) {
    const t = portable(theme, preset(theme));
    assert.deepEqual(cleanTemplate(JSON.stringify(t)), t);
  }
  const t = portable("test", preset("gaming"));
  t.plan.roles = ["Administrator"];
  assert.throws(() => cleanTemplate(t), /ordinary roles/);
  t.plan.roles = [];
  t.plan.categories[0].channels[0].permissionOverwrites = [{ allow: "8" }];
  assert.throws(() => cleanTemplate(t), /Unsupported/);
  assert.throws(
    () =>
      cleanTemplate(
        '{"__proto__":{},"format":"seep-template","version":1,"name":"x","plan":{}}',
      ),
    /Unsupported/,
  );
  assert.throws(() => cleanTemplate("x".repeat(128001)), /128 KB/);
});
test("private templates are isolated by server and owner and persist in the store", () => {
  const store = new Store(":memory:");
  try {
    const a = new Templates(store, "g", "a"),
      b = new Templates(store, "g", "b"),
      other = new Templates(store, "other", "a");
    const t = a.save(portable("Gaming", preset("gaming")));
    assert.equal(a.list().length, 1);
    assert.equal(b.list().length, 0);
    assert.throws(() => b.get(t.id), /not found/);
    assert.throws(() => other.get(t.id), /not found/);
    assert.equal(new Templates(store, "g", "a").get(t.id).name, "Gaming");
    a.remove(t.id);
    assert.equal(a.list().length, 0);
  } finally {
    store.close();
  }
});
test("external coding provider never leaks errors or silently falls back", async () => {
  const env = {
    CODE_AI_PROVIDER: "compatible",
    CODE_AI_URL: "https://example.com/chat/completions",
    CODE_AI_KEY: "private-secret",
    CODE_AI_MODEL: "configured-model",
  };
  await assert.rejects(
    codeCompletion("question", { system: "system" }, env, async () =>
      Response.json({ error: "private-secret" }, { status: 401 }),
    ),
    (e) => e.message.includes("401") && !e.message.includes("private-secret"),
  );
  await assert.rejects(
    codeCompletion(
      "question",
      {},
      { ...env, CODE_AI_URL: "http://example.com" },
    ),
    /HTTPS/,
  );
  let body;
  const reply = await codeCompletion(
    "user code",
    { system: "system" },
    env,
    async (u, o) => {
      body = JSON.parse(o.body);
      return Response.json({
        choices: [{ message: { content: "suggestion" } }],
      });
    },
  );
  assert.equal(reply, "suggestion");
  assert.equal(body.max_tokens, 1600);
});

test("reset during generation cannot restore deleted context", async () => {
  let finish;
  const service = new CodingAssistant(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = service.run("guild:user", {
    task: "generate",
    prompt: "hello",
    remember: true,
  });
  service.reset("guild:user");
  finish("done");
  assert.equal((await request).contextSaved, false);
  assert.equal(service.history.has("guild:user"), false);
});
