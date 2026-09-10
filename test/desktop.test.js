import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { explainError, availableIntents } from "../src/status.js";
import { Store } from "../src/store.js";

test("disabled privileged intents leave a usable set of basic features", () => {
  assert.deepEqual(availableIntents(0), { members: false, content: false });
  assert.deepEqual(availableIntents((1 << 15) | (1 << 19)), {
    members: true,
    content: true,
  });
  assert.deepEqual(availableIntents(1 << 14), {
    members: true,
    content: false,
  });
});

test("empty AggregateError from blocked connections has an actionable message", () => {
  const error = new AggregateError([
    Object.assign(new Error(), { code: "EACCES" }),
  ]);
  assert.match(explainError(error), /blocked.*Discord connection/);
});

test("Discord failures explain the next step", () => {
  assert.match(
    explainError(new Error("Used disallowed intents")),
    /Server Members Intent.*Message Content Intent/,
  );
  assert.match(explainError({ status: 401 }), /bot token/);
  assert.match(explainError({ code: 50001 }), /invite this bot/);
  assert.match(
    explainError({ cause: { code: "ENOTFOUND" } }),
    /internet connection/,
  );
});

test("shutdown may safely close the store twice after a login failure", () => {
  const store = new Store(":memory:");
  store.set("test", "saved", true);
  store.close();
  assert.doesNotThrow(() => store.close());
});

test(
  "failed startup exits and releases its instance lock for another attempt",
  { timeout: 15000 },
  async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const child = spawn(
        process.execPath,
        ["src/desktop.js", "start", "--panel-mode"],
        {
          cwd: fileURLToPath(new URL("../", import.meta.url)),
          env: {
            ...process.env,
            DISCORD_TOKEN: "",
            DISCORD_CLIENT_ID: "",
            DISCORD_GUILD_ID: "",
          },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      let output = "";
      child.stdout.on("data", (data) => (output += data));
      child.stderr.on("data", (data) => (output += data));
      const killer = setTimeout(() => child.kill(), 6000);
      const [code] = await once(child, "exit");
      clearTimeout(killer);
      assert.equal(code, 1, output);
      assert.match(output, /Fill these in .env/);
      assert.match(output, /"type":"stopped","code":1/);
      assert.doesNotMatch(output, /already running|database is not open/);
    }
  },
);
