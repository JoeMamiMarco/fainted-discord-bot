import {
  createWriteStream,
  existsSync,
  mkdirSync,
  promises as fs,
} from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";

export async function installRuntime() {
  if (existsSync("runtime/ollama/ollama.exe")) return;
  mkdirSync("runtime", { recursive: true });
  console.log(
    "Downloading the official Ollama portable runtime. Only CPU libraries will be retained.",
  );
  const response = await fetch(
    "https://github.com/ollama/ollama/releases/download/v0.33.3/ollama-windows-amd64.zip",
  );
  if (!response.ok)
    throw new Error(`Runtime download failed (${response.status}).`);
  const hash = createHash("sha256");
  let bytes = 0,
    next = 100 * 1024 * 1024;
  await pipeline(
    response.body,
    new Transform({
      transform(chunk, encoding, callback) {
        hash.update(chunk);
        bytes += chunk.length;
        if (bytes >= next) {
          console.log(
            `Runtime download: ${Math.round(bytes / 1024 / 1024)} MB`,
          );
          next += 100 * 1024 * 1024;
        }
        callback(null, chunk);
      },
    }),
    createWriteStream("runtime/ollama-download.zip"),
  );
  if (
    hash.digest("hex") !==
    "52cb36a62e7e501f61514f60212dec7117b6c098811357585e02fffe32d2fcd7"
  )
    throw new Error("Runtime checksum did not match the official release.");
  const p = spawn(
    "powershell.exe",
    ["-NoProfile", "-File", "scripts/extract-runtime.ps1"],
    { windowsHide: true, stdio: "inherit" },
  );
  const [code] = await once(p, "exit");
  if (code !== 0) throw new Error("Runtime extraction failed.");
  await fs.unlink("runtime/ollama-download.zip");
  console.log("CPU runtime installed.");
}
