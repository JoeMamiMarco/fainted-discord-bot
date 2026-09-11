import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let running = false;
try {
  const response = await fetch("http://127.0.0.1:11438/api/session", {
    signal: AbortSignal.timeout(1500),
  });
  running = response.ok;
} catch {}
if (!running) {
  const child = spawn(
    process.execPath,
    ["--env-file-if-exists=.env", "src/dashboard-server.js"],
    {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, SEEP_AUTOSTART: "true" },
    },
  );
  child.on("error", () =>
    console.error("Could not start seep. Check your Node installation."),
  );
  child.unref();
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch("http://127.0.0.1:11438/api/session");
      if (response.ok) {
        running = true;
        break;
      }
    } catch {}
  }
}
if (!running) {
  console.error(
    "Seep could not start. Check runtime/seep-dashboard.log and your configuration.",
  );
  process.exitCode = 1;
} else
  console.log(
    "Seep dashboard: http://127.0.0.1:11438 — sign in with Discord. Closing your browser does not stop the bot. Use the Owner tab to stop or restart it.",
  );
