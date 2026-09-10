export function report(type, fields = {}) {
  console.log(`@@SEEP ${JSON.stringify({ type, ...fields })}`);
}

export function explainError(error) {
  const codes = [
    error?.code,
    error?.cause?.code,
    ...(error?.errors || []).map((e) => e.code),
  ];
  const message =
    error?.message ||
    error?.cause?.message ||
    codes.find(Boolean) ||
    "An unexpected error occurred.";
  if (/disallowed intents|4014/i.test(message) || codes.includes(4014))
    return "Enable Server Members Intent and Message Content Intent in Developer Portal > Bot, save, then restart.";
  if (
    error?.status === 401 ||
    /TokenInvalid|invalid token|unauthorized/i.test(message)
  )
    return "Discord rejected the bot token. Open Settings and paste the current token from Developer Portal > Bot.";
  if (error?.status === 403 || [50001, 50013].includes(error?.code))
    return "Discord denied access. Check the server ID, invite this bot to that server, and check its role permissions.";
  if (codes.some((code) => ["EACCES", "EPERM"].includes(code)))
    return "Windows or the current environment blocked the Discord connection. Allow Node.js through your firewall, then retry.";
  if (
    codes.some((code) =>
      [
        "ENOTFOUND",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "UND_ERR_CONNECT_TIMEOUT",
        "ECONNRESET",
      ].includes(code),
    )
  )
    return "Could not connect to Discord. Check your internet connection or firewall, then retry.";
  return message;
}

export function availableIntents(flags = 0) {
  return {
    members: Boolean(flags & ((1 << 14) | (1 << 15))),
    content: Boolean(flags & ((1 << 18) | (1 << 19))),
  };
}
