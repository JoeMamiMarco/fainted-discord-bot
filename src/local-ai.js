const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
import { withLocalAI } from "./ai-chat.js";

export function localSettings(env = process.env) {
  const url = new URL(env.OLLAMA_BASE_URL || "http://127.0.0.1:11435");
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Local AI must use a loopback address, such as http://127.0.0.1:11435.",
    );
  const model = env.OLLAMA_MODEL?.trim() || "qwen3-vl:4b-instruct";
  if (!/^[a-z0-9._-]+(?::[a-z0-9._-]+)?$/i.test(model) || /cloud/i.test(model))
    throw new Error("Choose an installed local model, not a cloud model.");
  return { url: url.origin, model };
}

export function localPlan(options) {
  return withLocalAI(() => rawLocalPlan(options));
}
async function rawLocalPlan({
  description,
  screenshot,
  schema,
  instructions,
  env = process.env,
  fetchFn = fetch,
}) {
  const { url, model } = localSettings(env);
  const user = { role: "user", content: description };
  if (screenshot) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(
        screenshot.contentType,
      ) ||
      screenshot.size > MAX_IMAGE_BYTES
    )
      throw new Error("Use a PNG, JPEG, or WebP screenshot under 8 MB.");
    if (screenshot.data) {
      if (
        typeof screenshot.data !== "string" ||
        screenshot.data.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3) ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(screenshot.data)
      )
        throw new Error("Invalid screenshot data.");
      const bytes = Buffer.from(screenshot.data, "base64");
      if (bytes.length > MAX_IMAGE_BYTES || bytes.length < 12)
        throw new Error("Invalid screenshot size.");
      const valid =
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        (bytes[0] === 255 && bytes[1] === 216) ||
        (bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP");
      if (!valid) throw new Error("Use an actual PNG, JPEG or WebP image.");
      user.images = [screenshot.data];
    } else {
      const imageURL = new URL(screenshot.url);
      if (
        imageURL.protocol !== "https:" ||
        imageURL.port ||
        imageURL.username ||
        imageURL.password ||
        !["cdn.discordapp.com", "media.discordapp.net"].includes(
          imageURL.hostname,
        )
      )
        throw new Error("Use a Discord-uploaded screenshot.");
      const response = await fetchFn(imageURL.href, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok || !response.body)
        throw new Error("Could not read the screenshot. Upload it again.");
      const reader = response.body.getReader(),
        chunks = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_IMAGE_BYTES) {
            await reader.cancel();
            throw new Error("Screenshot exceeds 8 MB.");
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      user.images = [Buffer.concat(chunks).toString("base64")];
    }
  }
  let response;
  try {
    response = await fetchFn(`${url}/api/chat`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(600000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              instructions +
              " Return only JSON matching this schema: " +
              JSON.stringify(schema),
          },
          user,
        ],
        format: schema,
        stream: false,
        think: false,
        keep_alive: 0,
        options: {
          num_ctx: 8192,
          num_predict: 6000,
          num_thread: 4,
          num_gpu: 0,
          temperature: 0.1,
        },
      }),
    });
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError")
      throw new Error(
        "Local AI took too long. Try a shorter description or template mode.",
      );
    throw new Error(
      "Local AI is not reachable. Start seep from seep Panel.exe.",
    );
  }
  if (response.status === 404)
    throw new Error(
      `Local model ${model} is not installed. Run Setup Local AI from the panel.`,
    );
  if (!response.ok)
    throw new Error(
      `Local AI failed (${response.status}). Check the panel log; no cloud fallback was used.`,
    );
  const body = await response.json();
  if (!body.done || body.done_reason === "length" || !body.message?.content)
    throw new Error(
      "Local AI did not complete a plan. Try a smaller server layout.",
    );
  return body.message.content;
}
