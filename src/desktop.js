import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { createServer } from "node:net";
import { report, explainError } from "./status.js";
import { localSettings } from "./local-ai.js";
import { checkEnv } from "./check.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const children = new Set();
let stopping = false;
let instanceLock;
let startupTimer;
let ready = false;
let botChild;
mkdirSync("runtime", { recursive: true });
const log = createWriteStream("runtime/ai-server.log", { flags: "a" });
const io = createInterface({ input: process.stdin });
io.on("line", (line) => {
  if (line.trim() === "stop") void stop();
  else if (
    line.startsWith("@@REQUEST ") &&
    line.length < 12000000 &&
    botChild &&
    !stopping
  )
    botChild.stdin.write(line + "\n");
});
io.on("close", () => {
  if (process.argv.includes("--panel-mode")) void stop();
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => void stop());

function child(executable, args, env = process.env, quiet = false) {
  if (stopping) throw new Error("Startup cancelled.");
  const p = spawn(executable, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.add(p);
  p.stdin.on("error", () => {});
  p.on("error", (e) => console.error(`Process failed: ${e.message}`));
  p.on("exit", () => children.delete(p));
  if (quiet) {
    p.stdout.pipe(log, { end: false });
    p.stderr.pipe(log, { end: false });
  } else {
    const lines = createInterface({ input: p.stdout });
    lines.on("line", (line) => {
      console.log(line);
      if (line.startsWith("@@SEEP ")) {
        try {
          if (JSON.parse(line.slice(7)).type === "online") {
            ready = true;
            clearTimeout(startupTimer);
          }
        } catch {}
      }
    });
    p.stderr.pipe(process.stderr, { end: false });
  }
  return p;
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(startupTimer);
  report("phase", {
    message: code
      ? "Cleaning up after the error..."
      : "Stopping bot and local AI...",
  });
  const active = [...children];
  // The bot flushes/closes SQLite via its private stdin shutdown command.
  for (const p of active) {
    try {
      p.stdin.write("stop\n");
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 1200));
  for (const p of active)
    if (p.exitCode === null && p.pid)
      await new Promise((done) => {
        if (process.platform !== "win32") {
          p.kill("SIGTERM");
          setTimeout(() => {
            if (p.exitCode === null) p.kill("SIGKILL");
            done();
          }, 1500);
          return;
        }
        const killer = spawn(
          "taskkill.exe",
          ["/PID", String(p.pid), "/T", "/F"],
          { windowsHide: true, stdio: "ignore" },
        );
        killer.on("error", done);
        killer.on("exit", done);
      });
  log.end();
  instanceLock?.close();
  report("stopped", { code });
  process.exit(code);
}
async function startLocal() {
  const { url } = localSettings();
  if (process.env.OLLAMA_EXTERNAL === "true") {
    const response = await fetch(url + "/api/version", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("External local Ollama is not ready.");
    return;
  }
  const binary = join(root, "runtime", "ollama", "ollama.exe");
  if (!existsSync(binary))
    throw new Error("Local AI runtime is missing. Click Setup Local AI first.");
  const occupied = await fetch(`${url}/api/version`, {
    signal: AbortSignal.timeout(700),
  })
    .then((r) => r.ok)
    .catch(() => false);
  if (occupied)
    throw new Error(
      "The local AI port is already in use. Stop the other seep panel before starting this one.",
    );
  const profile = join(root, "runtime", "ollama-profile");
  mkdirSync(profile, { recursive: true });
  const server = child(
    binary,
    ["serve"],
    {
      ...process.env,
      // This portable child gets its own profile; the Windows account is unchanged.
      USERPROFILE: profile,
      OLLAMA_HOST: new URL(url).host,
      OLLAMA_MODELS: join(root, "runtime", "models"),
      OLLAMA_NO_CLOUD: "1",
      OLLAMA_KEEP_ALIVE: "0",
      OLLAMA_NUM_PARALLEL: "1",
      OLLAMA_MAX_LOADED_MODELS: "1",
      OLLAMA_MAX_QUEUE: "2",
      OLLAMA_CONTEXT_LENGTH: "4096",
      OLLAMA_VULKAN: "0",
    },
    true,
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    if (stopping) throw new Error("Startup cancelled.");
    if (server.exitCode !== null)
      throw new Error("Local AI failed to start. See runtime/ai-server.log.");
    if (
      await fetch(`${url}/api/version`, { signal: AbortSignal.timeout(700) })
        .then((r) => r.ok)
        .catch(() => false)
    ) {
      console.log("Local AI ready. Model loads only when requested.");
      report("ai", { message: "Ready on demand" });
      server.on("exit", () => {
        if (!stopping) {
          report("ai", { message: "Unavailable" });
          report("warning", {
            message:
              "The AI service stopped. Moderation remains online. Restart to retry AI.",
          });
        }
      });
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Local AI startup timed out. See runtime/ai-server.log.");
}
async function pullModel() {
  const { url, model } = localSettings();
  console.log(`Setting up ${model}. This is a one-time model download.`);
  const response = await fetch(`${url}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!response.ok || !response.body)
    throw new Error(`Model download failed (${response.status}).`);
  let buffer = "",
    last = "";
  let success = false;
  for await (const chunk of response.body) {
    buffer += Buffer.from(chunk).toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const status = JSON.parse(line);
      if (status.error) throw new Error(status.error);
      const message = status.total
        ? `${status.status}: ${Math.floor(((status.completed || 0) / status.total) * 20) * 5}%`
        : status.status;
      if (message !== last) {
        console.log(message);
        last = message;
      }
      if (status.status === "success") success = true;
    }
  }
  if (!success)
    throw new Error(
      "The model download did not complete. Run setup again to resume.",
    );
  console.log("Local AI setup complete. No API key needed.");
}
async function modelInstalled() {
  const { url, model } = localSettings();
  const body = await fetch(`${url}/api/tags`).then((r) => r.json());
  return body.models?.some((x) => x.name === model || x.model === model);
}
try {
  const mode = process.argv[2] || "start";
  // This lock also covers legacy launchers, with automatic release after a crash.
  instanceLock = createServer();
  await new Promise((resolveLock, rejectLock) => {
    instanceLock.once("error", () =>
      rejectLock(
        new Error(
          "seep is already running. Close its other dashboard or launcher first.",
        ),
      ),
    );
    instanceLock.listen(11436, "127.0.0.1", resolveLock);
  });
  if (mode === "register") {
    checkEnv();
    const p = child(process.execPath, [
      "--env-file-if-exists=.env",
      "src/register.js",
    ]);
    const [code] = await once(p, "exit");
    await stop(code || 0);
  } else {
    if (mode === "setup") {
      const { installRuntime } = await import("./install-runtime.js");
      await installRuntime();
    }
    if (mode === "start") {
      report("phase", { message: "Checking settings and local AI..." });
      checkEnv();
      if (!existsSync(join(root, "node_modules", "discord.js")))
        throw new Error(
          "Bot dependencies are missing. Install Node.js 24+, then run npm install in this folder.",
        );
    }
    if (true || mode === "setup" || mode === "test-ai") {
      try {
        await startLocal();
        if (mode === "setup") {
          await pullModel();
          await stop();
        }
        if (!(await modelInstalled()))
          throw new Error("The local model is missing. Click Setup Local AI.");
      } catch (e) {
        if (mode !== "start" || stopping) throw e;
        report("ai", { message: "Needs setup" });
        report("warning", {
          message: `AI unavailable: ${explainError(e)} Moderation can still run.`,
        });
      }
    } else {
      report("ai", { message: "Cloud provider" });
    }
    if (mode === "test-ai") {
      const { generatePlan } = await import("./planner.js");
      const start = Date.now();
      const plan = await generatePlan(
        "Create a small gaming community with welcome, rules, general, game-help, a Hangout voice channel, and private server-logs. Use two roles and at most eight channels.",
        true,
      );
      writeFileSync("runtime/last-ai-test.json", JSON.stringify(plan, null, 2));
      console.log(
        JSON.stringify(
          {
            validated: true,
            elapsedSeconds: Math.round((Date.now() - start) / 1000),
            plan,
          },
          null,
          2,
        ),
      );
      await stop();
    }
    const p = child(
      process.execPath,
      ["--env-file-if-exists=.env", "src/index.js"],
      { ...process.env, SEEP_PANEL: "1" },
    );
    botChild = p;
    startupTimer = setTimeout(() => {
      report("error", {
        message:
          "Discord did not finish connecting within 60 seconds. Check your connection and Developer Portal settings, then retry.",
      });
      void stop(1);
    }, 60000);
    const [code] = await once(p, "exit");
    if (!stopping && code === 0)
      report("error", {
        message: ready
          ? "The bot exited unexpectedly. Press Start to reconnect."
          : "The bot exited before connecting. Review the activity log and settings.",
      });
    await stop(stopping ? 0 : code || 1);
  }
} catch (e) {
  if (!stopping) report("error", { message: explainError(e) });
  await stop(1);
}
