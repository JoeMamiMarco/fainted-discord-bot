import test from "node:test";
import assert from "node:assert/strict";
import { geminiPlan } from "../src/gemini.js";
import { generatePlan, parsePlan, templatePlan } from "../src/planner.js";

const options = {
  description: "A gaming server",
  instructions: "Plan only",
  schema: { type: "object" },
  env: { GEMINI_API_KEY: "test-key" },
};
const result = () =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(templatePlan("gaming")) }] },
      },
    ],
  });
test("Gemini uses a header key and structured JSON without sending OpenAI credentials", async () => {
  let request;
  const output = await geminiPlan({
    ...options,
    fetchFn: async (url, init) => {
      request = { url, ...init };
      return result();
    },
  });
  assert.ok(request.url.includes("gemini-2.5-flash-lite:generateContent"));
  assert.ok(!request.url.includes("test-key"));
  assert.equal(request.headers["x-goog-api-key"], "test-key");
  const body = JSON.parse(request.body);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(parsePlan(output), templatePlan("gaming"));
});
test("missing free key stops before making network requests", async () => {
  let calls = 0;
  await assert.rejects(
    geminiPlan({
      ...options,
      env: {},
      fetchFn: async () => {
        calls++;
      },
    }),
    /GEMINI_API_KEY/,
  );
  assert.equal(calls, 0);
});
test("quota exhaustion makes no retries or paid-provider fallback", async () => {
  let calls = 0;
  await assert.rejects(
    geminiPlan({
      ...options,
      fetchFn: async () => {
        calls++;
        return new Response("", { status: 429 });
      },
    }),
    /No paid fallback/,
  );
  assert.equal(calls, 1);
});
test("blocked or truncated model output is not accepted as a plan", async () => {
  for (const finishReason of ["SAFETY", "MAX_TOKENS"])
    await assert.rejects(
      geminiPlan({
        ...options,
        fetchFn: async () =>
          Response.json({
            candidates: [
              { finishReason, content: { parts: [{ text: "{}" }] } },
            ],
          }),
      }),
      /did not finish/,
    );
  assert.throws(() => parsePlan("{}"), /invalid plan/);
});
test("screenshots cannot fetch arbitrary URLs", async () => {
  let calls = 0;
  await assert.rejects(
    geminiPlan({
      ...options,
      screenshot: {
        url: "http://127.0.0.1/secret",
        contentType: "image/png",
        size: 10,
      },
      fetchFn: async () => {
        calls++;
      },
    }),
    /Discord-uploaded/,
  );
  assert.equal(calls, 0);
});
test("Discord screenshot bytes are sent inline without API credentials on the download", async () => {
  const requests = [];
  await geminiPlan({
    ...options,
    screenshot: {
      url: "https://cdn.discordapp.com/attachments/a/b/test.png",
      contentType: "image/png",
      size: 4,
    },
    fetchFn: async (url, init) => {
      requests.push({ url, ...init });
      return requests.length === 1
        ? new Response(new Uint8Array([1, 2, 3, 4]))
        : result();
    },
  });
  assert.equal(requests[0].headers, undefined);
  assert.equal(requests[0].redirect, "error");
  assert.equal(
    JSON.parse(requests[1].body).contents[0].parts[1].inlineData.data,
    "AQIDBA==",
  );
});
test("template mode remains available without any API key", async () => {
  assert.deepEqual(await generatePlan("gaming", false), templatePlan("gaming"));
});
test("AI routing explicitly selects Gemini and validates its returned plan", async (t) => {
  const previous = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key";
  t.after(() => {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
  const mocked = t.mock.method(globalThis, "fetch", async () => result());
  assert.deepEqual(await generatePlan("gaming", true), templatePlan("gaming"));
  assert.equal(mocked.mock.callCount(), 1);
  assert.ok(
    mocked.mock.calls[0].arguments[0].startsWith(
      "https://generativelanguage.googleapis.com/",
    ),
  );
});
