import { PermissionFlagsBits as P } from "discord.js";
const s = (name, description, required = false, extra = {}) => ({
  type: 3,
  name,
  description,
  required,
  ...extra,
});
const u = (name = "user", description = "Member", required = true) => ({
  type: 6,
  name,
  description,
  required,
});
const n = (name, description, min, max, required = true) => ({
  type: 4,
  name,
  description,
  required,
  min_value: min,
  max_value: max,
});
const c = (name, description, required = true) => ({
  type: 7,
  name,
  description,
  required,
  channel_types: [0],
});
const r = (name, description, required = true) => ({
  type: 8,
  name,
  description,
  required,
});
const b = (name, description, required = true) => ({
  type: 5,
  name,
  description,
  required,
});
const sub = (name, description, options = []) => ({
  type: 1,
  name,
  description,
  options,
});
const cmd = (name, description, options = [], permission) => ({
  name,
  description,
  options,
  dm_permission: false,
  ...(permission ? { default_member_permissions: String(permission) } : {}),
});
const reason = s("reason", "Reason for the moderation record", true, {
  max_length: 400,
});
export const commands = [
  cmd("help", "Show the Fainted command guide"),
  cmd("warn", "Record a warning", [u(), reason], P.ModerateMembers),
  cmd("history", "Show recent moderation history", [u()], P.ModerateMembers),
  cmd(
    "timeout",
    "Temporarily restrict a member",
    [u(), s("duration", "10m, 2h, or 7d", true), reason],
    P.ModerateMembers,
  ),
  cmd("untimeout", "Remove a timeout", [u(), reason], P.ModerateMembers),
  cmd("kick", "Remove a member", [u(), reason], P.KickMembers),
  cmd(
    "ban",
    "Ban a member (keeps message history)",
    [u(), reason],
    P.BanMembers,
  ),
  cmd(
    "unban",
    "Unban by user ID",
    [s("user_id", "Discord user ID", true), reason],
    P.BanMembers,
  ),
  cmd(
    "purge",
    "Remove up to 100 recent messages",
    [n("count", "Number of messages", 1, 100)],
    P.ManageMessages,
  ),
  cmd(
    "slowmode",
    "Set this channel slowmode",
    [n("seconds", "0 disables slowmode", 0, 21600)],
    P.ManageChannels,
  ),
  cmd(
    "lock",
    "Prevent @everyone from sending in this channel",
    [],
    P.ManageChannels,
  ),
  cmd(
    "unlock",
    "Restore the previous @everyone send permission",
    [],
    P.ManageChannels,
  ),
  cmd(
    "settings",
    "Configure your server",
    [
      sub("show", "View current settings"),
      sub(
        "channels",
        "Set welcome, goodbye, and private logging destinations",
        [
          c("welcome", "Welcome channel", false),
          c("goodbye", "Goodbye channel", false),
          c("logs", "Private staff log channel", false),
        ],
      ),
      sub("roles", "Set automatic join and ticket support roles", [
        r("auto", "Normal role assigned on joining", false),
        r("support", "Staff role for tickets", false),
      ]),
      sub("messages", "Customize join and leave messages", [
        s("welcome", "Use {user}, {name}, {server}, {count}", false, {
          max_length: 1500,
        }),
        s("goodbye", "Use {name}, {server}, {count}", false, {
          max_length: 1500,
        }),
      ]),
      sub("automod", "Configure automatic message deletion", [
        b("enabled", "Enable AutoMod"),
        b("block_invites", "Block Discord invites", false),
        n("mentions", "Mention threshold", 3, 30, false),
        n("spam", "Messages per 8 seconds", 3, 20, false),
        s("words", "Comma-separated blocked words; use none to clear", false, {
          max_length: 500,
        }),
      ]),
      sub("leveling", "Enable or disable XP", [b("enabled", "Enable XP")]),
      sub("clear", "Disable a configured channel or role", [
        s("setting", "Setting to clear", true, {
          choices: [
            "welcomeChannel",
            "goodbyeChannel",
            "logChannel",
            "autoRole",
            "supportRole",
          ].map((value) => ({ name: value, value })),
        }),
      ]),
    ],
    P.ManageGuild,
  ),
  cmd("rank", "Show XP and level", [u("user", "Member (default: you)", false)]),
  cmd("leaderboard", "Show the top 10 members by XP"),
  cmd("invites", "Show known invite referrals", [
    u("user", "Inviter (default: you)", false),
  ]),
  cmd("invite-leaderboard", "Show tracked invite referrals"),
  cmd(
    "analytics",
    "Show actual recorded server activity",
    [n("days", "Last 1–90 days", 1, 90, false)],
    P.ManageGuild,
  ),
  cmd(
    "role-panel",
    "Post a button and reaction self-role panel",
    [
      r("role", "Normal opt-in role"),
      s("label", "Panel title", true, { max_length: 80 }),
      s("emoji", "One Unicode emoji, e.g. ✅", false, { max_length: 16 }),
    ],
    P.ManageRoles,
  ),
  cmd(
    "onboarding",
    "Post rules acknowledgment and an optional member role",
    [
      s("rules", "Rules members must accept", true, { max_length: 1800 }),
      r("role", "Normal role granted after accepting", false),
    ],
    P.ManageGuild,
  ),
  cmd("ticket", "Support ticket system", [
    sub("panel", "Post a ticket-opening button"),
    sub("close", "Close this ticket without deleting its history"),
  ]),
  cmd(
    "poll",
    "Polls with persistent, changeable votes",
    [
      sub("create", "Create a poll", [
        s("question", "Question", true, { max_length: 200 }),
        s("options", "2–5 answers separated by |", true, { max_length: 400 }),
      ]),
      sub("close", "Close a poll", [s("message_id", "Poll message ID", true)]),
    ],
    P.ManageMessages,
  ),
  cmd(
    "inactive",
    "Preview inactive members; confirm up to 10 kicks",
    [
      n(
        "days",
        "Days without observed messages (bot must have observed this long)",
        7,
        365,
      ),
    ],
    P.KickMembers,
  ),
  cmd(
    "server",
    "Plan and build server channels and roles",
    [
      sub("plan", "Preview a new layout; template mode works without AI", [
        s(
          "description",
          "Describe your community; sent to your AI provider only in AI mode",
          true,
          { max_length: 1500 },
        ),
        b("ai", "Use Fainted AI (local by default; no API key needed)", false),
        {
          type: 11,
          name: "screenshot",
          description:
            "Optional layout image sent to your AI provider in AI mode",
          required: false,
        },
      ]),
      sub("snapshot", "Export current channel/role names as a reusable layout"),
    ],
    P.ManageGuild,
  ),
];
