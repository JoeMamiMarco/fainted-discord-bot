import { PermissionFlagsBits as P, PermissionsBitField } from "discord.js";

export function duration(text) {
  const match = /^(\d+)(s|m|h|d)$/.exec(text || "");
  if (!match) throw new Error("Use a duration such as 10m, 2h, or 7d.");
  const ms =
    Number(match[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  if (ms < 1000 || ms > 28 * 86400000)
    throw new Error("Duration must be between 1 second and 28 days.");
  return ms;
}
export function requirePermission(member, permission) {
  if (!member.permissions.has(permission))
    throw new Error("You do not have the required Discord permission.");
}
export function guardTarget(actor, target, me, ownerId) {
  if (
    !target ||
    target.id === ownerId ||
    target.id === actor.id ||
    target.id === me.id
  )
    throw new Error("You cannot moderate this member.");
  if (
    actor.id !== ownerId &&
    actor.roles.highest.comparePositionTo(target.roles.highest) <= 0
  )
    throw new Error("Your role must be above this member.");
  if (me.roles.highest.comparePositionTo(target.roles.highest) <= 0)
    throw new Error("Move the bot role above this member.");
}
// Reject anything beyond ordinary participation permissions, including new bits.
const selfRolePermissions = new PermissionsBitField([
  P.ViewChannel,
  P.SendMessages,
  P.SendMessagesInThreads,
  P.ReadMessageHistory,
  P.AddReactions,
  P.EmbedLinks,
  P.AttachFiles,
  P.UseExternalEmojis,
  P.UseExternalStickers,
  P.UseApplicationCommands,
  P.Connect,
  P.Speak,
  P.Stream,
  P.UseVAD,
  P.ChangeNickname,
  P.CreatePublicThreads,
  P.CreatePrivateThreads,
  P.RequestToSpeak,
  P.UseEmbeddedActivities,
]);
export function guardSelfRole(role, me) {
  if (
    !role ||
    role.id === role.guild.id ||
    role.managed ||
    !role.editable ||
    role.comparePositionTo(me.roles.highest) >= 0 ||
    (role.permissions.bitfield & ~selfRolePermissions.bitfield) !== 0n
  )
    throw new Error("Choose a normal, non-staff role below the bot role.");
}
export function violation(content, mentions, recentCount, config) {
  if (!config.automod) return null;
  if (mentions >= config.mentionLimit) return "Mention spam";
  if (recentCount >= config.spamLimit) return "Message spam";
  if (
    config.blockInvites &&
    /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i.test(content)
  )
    return "Discord invite link";
  if (
    config.blockedWords.some((word) =>
      content.toLowerCase().includes(word.toLowerCase()),
    )
  )
    return "Blocked word";
  return null;
}
export function level(xp) {
  return Math.floor(Math.sqrt(xp / 100));
}
export function template(text, member) {
  return text
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{name}", member.user.username)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", String(member.guild.memberCount))
    .slice(0, 1900);
}
