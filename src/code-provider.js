import { localChat } from "./ai-chat.js";

// External providers are opt-in and are never silently used after a local failure.
export async function codeCompletion(
  prompt,
  options = {},
  env = process.env,
  fetchFn = fetch,
) {
  const provider = env.CODE_AI_PROVIDER || "local";
  if (provider === "local") return localChat(prompt, options);
  if (provider !== "compatible")
    throw new Error("CODE_AI_PROVIDER must be local or compatible.");
  let endpoint;
  try {
    endpoint = new URL(env.CODE_AI_URL);
  } catch {
    throw new Error("Configure CODE_AI_URL for the coding provider.");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.search
  )
    throw new Error(
      "Coding provider endpoint must be an HTTPS URL without embedded credentials.",
    );
  if (!env.CODE_AI_KEY || !env.CODE_AI_MODEL)
    throw new Error("Configure the coding provider key and model on the host.");
  const body = JSON.stringify({
    model: env.CODE_AI_MODEL,
    stream: false,
    max_tokens: 1600,
    temperature: 0.15,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: prompt.slice(0, 22000) },
    ],
  });
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetchFn(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: "Bearer " + env.CODE_AI_KEY,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(120000),
      });
    } catch {
      throw new Error(
        "Coding provider is unavailable or timed out. No alternate provider was contacted.",
      );
    }
    if (response.status !== 429 || attempt === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!response.ok)
    throw new Error(
      "Coding provider returned HTTP " +
        response.status +
        ". Check host configuration or provider quota.",
    );
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim())
    throw new Error("Coding provider returned an empty response.");
  return text.slice(0, 24000);
}
