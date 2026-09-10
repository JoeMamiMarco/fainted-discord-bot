import test from "node:test";
import assert from "node:assert/strict";
import { localPlan, localSettings } from "../src/local-ai.js";
import {
  layoutBudget,
  parseLocalLayout,
  generatePlan,
} from "../src/planner.js";

const layout = {
  roles: ["Member"],
  channels: [
    { name: "welcome", type: "text", category: "INFORMATION", private: false },
    {
      name: "server-logs",
      type: "text",
      category: "COMMUNITY",
      private: false,
    },
  ],
};
const base = {
  description: "A community",
  schema: { type: "object" },
  instructions: "Make a layout",
  env: {},
};
const response = () =>
  Response.json({
    done: true,
    done_reason: "stop",
    message: { content: JSON.stringify(layout) },
  });
test("local settings reject remote endpoints and cloud model names", () => {
  for (const url of [
    "https://api.example.com",
    "http://192.168.1.2:11434",
    "http://localhost:11435/redirect",
    "http://user:pass@localhost:11435",
  ])
    assert.throws(() => localSettings({ OLLAMA_BASE_URL: url }));
  assert.throws(() => localSettings({ OLLAMA_MODEL: "qwen3:cloud" }));
  assert.equal(localSettings({}).model, "qwen3-vl:2b-instruct");
});
test("local requests have no API credentials and release memory immediately", async () => {
  let request;
  await localPlan({
    ...base,
    fetchFn: async (url, init) => {
      request = { url, ...init };
      return response();
    },
  });
  assert.ok(request.url.startsWith("http://127.0.0.1:11435/"));
  assert.deepEqual(Object.keys(request.headers), ["Content-Type"]);
  assert.equal(request.redirect, "error");
  const body = JSON.parse(request.body);
  assert.equal(body.keep_alive, 0);
  assert.equal(body.options.num_thread, 4);
  assert.equal(body.options.num_gpu, 0);
  assert.equal(body.options.num_ctx, 4096);
});
test("local AI failures never fall back to cloud", async () => {
  let calls = 0;
  await assert.rejects(
    localPlan({
      ...base,
      fetchFn: async () => {
        calls++;
        throw new Error("ECONNREFUSED");
      },
    }),
    /Start seep/,
  );
  assert.equal(calls, 1);
});
test("local screenshot fetching blocks arbitrary destinations", async () => {
  let calls = 0;
  await assert.rejects(
    localPlan({
      ...base,
      screenshot: {
        url: "http://localhost:9999/secret",
        size: 10,
        contentType: "image/png",
      },
      fetchFn: async () => {
        calls++;
      },
    }),
    /Discord-uploaded/,
  );
  assert.equal(calls, 0);
});
test("explicit channel budgets are enforced in converted layouts", () => {
  assert.equal(layoutBudget("at most eight channels"), 8);
  assert.equal(layoutBudget("up to 40 channels"), 30);
  assert.equal(layoutBudget("gaming community"), 12);
  assert.throws(() => parseLocalLayout(JSON.stringify(layout), 1));
});
test("server logs are always placed in a private staff category", () => {
  const plan = parseLocalLayout(JSON.stringify(layout), 8);
  const staff = plan.categories.find((c) => c.name === "STAFF");
  assert.equal(staff.private, true);
  assert.equal(staff.channels[0].name, "server-logs");
});
test("local AI is selected by default without any API key", async (t) => {
  const previous = process.env.AI_PROVIDER;
  delete process.env.AI_PROVIDER;
  t.after(() => {
    if (previous === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previous;
  });
  const mocked = t.mock.method(globalThis, "fetch", async () => response());
  const plan = await generatePlan("at most eight channels", true);
  assert.equal(plan.categories.length, 2);
  assert.ok(
    mocked.mock.calls[0].arguments[0].startsWith("http://127.0.0.1:11435/"),
  );
});
