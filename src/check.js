export function checkEnv(env = process.env) {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Install Node.js 24 or newer to run Fainted.");
  const missing = [
    "DISCORD_TOKEN",
    "DISCORD_CLIENT_ID",
    "DISCORD_GUILD_ID",
  ].filter((k) => !env[k] || env[k].startsWith("YOUR_"));
  if (missing.length)
    throw new Error(`Fill these in .env: ${missing.join(", ")}`);
  for (const key of ["DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"])
    if (!/^\d{17,20}$/.test(env[key]))
      throw new Error(`${key} must be a Discord ID (17–20 digits).`);
  return true;
}
if (process.argv[1]?.endsWith("check.js")) {
  try {
    checkEnv();
    console.log(
      "Required settings are filled. This does not test token validity or server permissions.",
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
