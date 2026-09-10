const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function geminiPlan({
  description,
  screenshot,
  schema,
  instructions,
  env = process.env,
  fetchFn = fetch,
}) {
  if (!env.GEMINI_API_KEY?.trim())
    throw new Error(
      "Create a free Gemini key at https://aistudio.google.com/apikey and put it in GEMINI_API_KEY in .env.",
    );
  const model = env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
  if (!/^gemini-[a-z0-9.-]+$/.test(model))
    throw new Error("GEMINI_MODEL must be a Gemini model name.");
  const parts = [{ text: description }];
  if (screenshot) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(
        screenshot.contentType,
      ) ||
      screenshot.size > MAX_IMAGE_BYTES
    )
      throw new Error("Use a PNG, JPEG, or WebP screenshot under 8 MB.");
    const url = new URL(screenshot.url);
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)
    )
      throw new Error("Use a Discord-uploaded screenshot.");
    const image = await fetchFn(url.href, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!image.ok || !image.body)
      throw new Error("Could not read the screenshot. Upload it again.");
    const reader = image.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_IMAGE_BYTES) {
          await reader.cancel();
          throw new Error("Screenshot exceeds 8 MB.");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    parts.push({
      inlineData: {
        mimeType: screenshot.contentType,
        data: Buffer.concat(chunks).toString("base64"),
      },
    });
  }
  const response = await fetchFn(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        systemInstruction: { parts: [{ text: instructions }] },
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          maxOutputTokens: 4096,
        },
      }),
    },
  );
  // Do not retry against another provider or fall back to a paid model.
  if (response.status === 429)
    throw new Error(
      "Gemini quota/rate limit reached. Wait for it to reset or use /server plan with ai:false. No paid fallback was used.",
    );
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "Gemini rejected the key or project access. Check your key and free-tier eligibility in Google AI Studio.",
    );
  if (response.status === 404)
    throw new Error(
      "Gemini model is unavailable. Choose a supported free-tier model in GEMINI_MODEL.",
    );
  if (!response.ok)
    throw new Error(
      `Gemini request failed (${response.status}). Try again later or use template mode.`,
    );
  const body = await response.json();
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason !== "STOP")
    throw new Error(
      "Gemini did not finish a usable plan. Try a simpler description; no server changes were made.",
    );
  return (
    candidate.content?.parts
      ?.filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("") || ""
  );
}
