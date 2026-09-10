import { PermissionFlagsBits as P } from "discord.js";

export function canManage(guild) {
  try {
    const permissions = BigInt(guild.permissions || 0);
    return (
      guild.owner === true ||
      (permissions & (P.Administrator | P.ManageGuild)) !== 0n
    );
  } catch {
    return false;
  }
}
const allowed = new Set([
  "snapshot",
  "chat",
  "analyze",
  "plan",
  "build",
  "settings",
  "embed",
  "giveaway",
  "giveaway-end",
  "giveaway-reroll",
  "poll",
  "event",
  "backup",
  "restore-preview",
  "lockdown",
  "unlock",
  "ticket-transcript",
  "ticket-priority",
  "panel",
]);
export async function authorizeAction(guild, userId, action, payload = {}) {
  if (!allowed.has(action))
    throw new Error("This action is not available in the member dashboard.");
  await guild.roles.fetch();
  const member = await guild.members.fetch({ user: userId, force: true });
  if (!member.permissions.has(P.ManageGuild))
    throw new Error("You need Manage Server or Administrator in this server.");
  const requires = {
    build: [P.ManageChannels, P.ManageRoles],
    lockdown: [P.ManageChannels],
    unlock: [P.ManageChannels],
    panel: [P.ManageRoles, P.ManageChannels],
    event: [P.ManageEvents],
    "ticket-transcript": [P.ManageChannels],
    "ticket-priority": [P.ManageChannels],
    backup: [P.Administrator],
    "restore-preview": [P.Administrator],
  };
  // Settings can enable actions involving bans, roles and private channels. Restrict configuration to administrators.
  if (action === "settings" && !member.permissions.has(P.Administrator))
    throw new Error(
      "Administrator is required to change bot automation settings.",
    );
  if (requires[action] && !member.permissions.has(requires[action]))
    throw new Error("Your Discord permissions do not allow this action.");
  if (payload.channel) {
    const channel = await guild.channels.fetch(payload.channel);
    if (
      !channel ||
      !channel.permissionsFor(member)?.has([P.ViewChannel, P.SendMessages])
    )
      throw new Error("You cannot access or send messages in that channel.");
    if (
      action === "ticket-transcript" &&
      !channel.permissionsFor(member).has(P.ReadMessageHistory)
    )
      throw new Error("You need Read Message History for a transcript.");
    if (
      payload.webhook &&
      !channel.permissionsFor(member).has(P.ManageWebhooks)
    )
      throw new Error("You need Manage Webhooks in that channel.");
  }
  return member;
}
export function filterSnapshot(snapshot, guild, member) {
  const visible = new Set(
    guild.channels.cache
      .filter((c) => c.permissionsFor(member)?.has(P.ViewChannel))
      .map((c) => c.id),
  );
  snapshot.channels = snapshot.channels.filter((c) => visible.has(c.id));
  for (const key of ["tickets", "giveaways", "polls", "events"])
    snapshot[key] = (snapshot[key] || []).filter((x) => visible.has(x.channel));
  snapshot.analytics.channels = snapshot.analytics.channels.filter((x) =>
    visible.has(x.id),
  );
  if (!member.permissions.has(P.ViewAuditLog)) {
    snapshot.analytics.cases = [];
    snapshot.sources = [];
  }
  if (!member.permissions.has(P.Administrator)) {
    snapshot.config = { aiMentions: snapshot.config.aiMentions };
    snapshot.backups = [];
  }
  return snapshot;
}
