const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
  const model = env.OLLAMA_MODEL?.trim() || "qwen3-vl:2b-instruct";
  if (!/^[a-z0-9._-]+(?::[a-z0-9._-]+)?$/i.test(model) || /cloud/i.test(model))
    throw new Error("Choose an installed local model, not a cloud model.");
  return { url: url.origin, model };
}

export async function localPlan({
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
  let response;
  try {
    response = await fetchFn(`${url}/api/chat`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(240000),
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
          num_ctx: 4096,
          num_predict: 1800,
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
      "Local AI is not reachable. Start Fainted from Fainted Panel.exe.",
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
