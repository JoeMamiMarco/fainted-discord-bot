// Curated facts from Discord's permission and gateway documentation, plus this bot's actual capabilities.
// https://docs.discord.com/developers/topics/permissions
// https://docs.discord.com/developers/events/gateway#privileged-intents
export function assistantKnowledge(question) {
  const q = String(question).toLowerCase(),
    facts = [];
  if (/role|hierarchy|permission|administrator|assign/.test(q))
    facts.push(
      `Role management: a member with Manage Roles can manage only roles BELOW that member's highest role. The member's highest role is not necessarily the highest role in the whole server. Administrator does not bypass Discord's role-hierarchy restrictions. To fix an authorized assignment, the server owner can move the trusted manager's highest role ABOVE the particular role they are allowed to assign (or move only that target role below the manager); keep sensitive staff/admin roles above them. Do NOT move the manager below the target role. Channel permission overwrites do not change the order of roles or authorize assigning higher roles. Overwrites cover channel access/actions including viewing, sending and connecting, not just posting. Seep's bot role also needs to be above its target role/member. A request for advice does not mean that any changes have already been made.`,
    );
  if (/mention|reply|respond|message content|intent/.test(q))
    facts.push(
      `Seep responds to explicit mentions and replies to its own messages. Message Content Intent must be enabled and the bot restarted for reliable unmentioned reply text. Server Members Intent enables member events. Developer Portal > Bot contains the intent switches. Channel View Channel, Send Messages and Read Message History permissions are separate requirements. No Discord user token is needed.`,
    );
  if (/ticket|private|staff/.test(q))
    facts.push(
      `Private tickets must deny View Channel to @everyone and allow only the requester, configured support role and bot. Administrator can see all channels. Seep supports ticket claim, close, priority, and an export of the latest 100 messages. It does not promise a complete historical transcript.`,
    );
  if (/build|server|layout|channel/.test(q))
    facts.push(
      `Seep's AI builder creates a reviewable draft before Build. It adds missing categories, text/voice channels, and ordinary roles; it does not delete or rename existing channels. Limits: 6 categories, 8 roles, 30 channels per plan. Chat cannot execute changes. The bot and member-dashboard user need Manage Channels and Manage Roles to apply a layout.`,
    );
  if (/ban|kick|raid|moderat|spam/.test(q))
    facts.push(
      `Moderation must respect actor and bot permissions and role hierarchy, and cannot target the server owner. Automatic kicks, anti-nuke role removal, and raid lockdown are opt-in. A suspicious message alone is not proof of a raid. Seep provides warn, history, timeout, untimeout, kick, ban, unban, purge, slowmode, lock and unlock commands. Do not invent additional commands.`,
    );
  return facts.slice(0, 3).join("\n\n");
}
