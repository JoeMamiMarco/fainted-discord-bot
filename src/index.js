import {
  Client,
  Events,
  GatewayIntentBits as I,
  Partials,
  ActivityType,
  REST,
  Routes,
} from "discord.js";
import { Store } from "./store.js";
import { Bot } from "./bot.js";
import { checkEnv } from "./check.js";
import { createInterface } from "node:readline";
import { report, explainError, availableIntents } from "./status.js";
import { commands } from "./commands.js";
let capabilities;
try {
  checkEnv();
  report("phase", { message: "Checking your Discord application..." });
  const rest = new REST({ version: "10", timeout: 15000, retries: 1 }).setToken(
    process.env.DISCORD_TOKEN,
  );
  const app = await rest.get(Routes.oauth2CurrentApplication());
  if (app.id !== process.env.DISCORD_CLIENT_ID)
    throw new Error(
      "The application ID does not match this bot token. Correct it in Settings.",
    );
  await rest.get(Routes.guild(process.env.DISCORD_GUILD_ID));
  capabilities = availableIntents(app.flags);
  const missing = [
    !capabilities.members && "Server Members Intent",
    !capabilities.content && "Message Content Intent",
  ].filter(Boolean);
  if (missing.length)
    report("warning", {
      message: `Enable ${missing.join(" and ")} in Developer Portal > Bot, then restart. Slash commands work; affected member events or message automod stay unavailable.`,
    });
  report("phase", { message: "Syncing server commands..." });
  const route = Routes.applicationGuildCommands(
    app.id,
    process.env.DISCORD_GUILD_ID,
  );
  // Compare the declared fields, ignoring Discord-assigned IDs and metadata.
  const current = await rest.get(route);
  const matches = (actual, expected) => {
    if (Array.isArray(expected))
      return (
        Array.isArray(actual) &&
        actual.length === expected.length &&
        expected.every((item, i) => matches(actual[i], item))
      );
    if (expected && typeof expected === "object")
      return (
        actual &&
        Object.entries(expected).every(([key, value]) =>
          matches(actual[key], value),
        )
      );
    return actual === expected || (expected === false && actual === undefined);
  };
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (!matches([...current].sort(byName), [...commands].sort(byName)))
    await rest.put(route, { body: commands });
  report("commands", { message: `${commands.length} commands ready` });
} catch (e) {
  report("error", { message: explainError(e) });
  process.exit(1);
}
const client = new Client({
  intents: [
    I.Guilds,
    ...(capabilities.members ? [I.GuildMembers] : []),
    I.GuildMessages,
    ...(capabilities.content ? [I.MessageContent] : []),
    I.GuildMessageReactions,
    I.GuildInvites,
    I.GuildModeration,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
  allowedMentions: { parse: [] },
});
const store = new Store(),
  bot = new Bot(client, store);
bot.capabilities = capabilities;
const safe =
  (fn) =>
  (...args) =>
    Promise.resolve()
      .then(() => fn(...args))
      .catch((e) => console.error(`Event failed: ${e.message}`));
client.once(Events.ClientReady, async () => {
  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    if (!store.get(guild.id, "observedSince"))
      store.set(guild.id, "observedSince", Date.now());
    await bot
      .refreshInvites(guild)
      .catch((e) =>
        report("warning", { message: `Invite tracking: ${explainError(e)}` }),
      );
    store.prune();
    client.user.setActivity("/help • Fainted moderation", {
      type: ActivityType.Watching,
    });
    console.log(`Fainted is online as ${client.user.tag} in ${guild.name}.`);
    report("online", {
      bot: client.user.tag,
      server: guild.name,
      limited: !capabilities.members || !capabilities.content,
    });
  } catch (e) {
    report("error", { message: explainError(e) });
    shutdown(1);
  }
});
client.on(Events.InteractionCreate, (i) => bot.handle(i));
client.on(
  Events.MessageCreate,
  safe((m) => bot.message(m)),
);
client.on(
  Events.MessageUpdate,
  safe(async (_, m) => {
    if (m.partial) await m.fetch();
    if (capabilities.content) await bot.message(m, true);
  }),
);
client.on(
  Events.MessageReactionAdd,
  safe((r, u) => bot.reaction(r, u, true)),
);
client.on(
  Events.MessageReactionRemove,
  safe((r, u) => bot.reaction(r, u, false)),
);
client.on(
  Events.GuildMemberAdd,
  safe((m) => bot.joined(m)),
);
client.on(
  Events.GuildMemberRemove,
  safe((m) => bot.left(m)),
);
client.on(
  Events.InviteCreate,
  safe((invite) => {
    if (invite.guild?.id === process.env.DISCORD_GUILD_ID)
      return bot.refreshInvites(invite.guild);
  }),
);
client.on(
  Events.InviteDelete,
  safe((invite) => {
    if (invite.guild?.id === process.env.DISCORD_GUILD_ID)
      return bot.refreshInvites(invite.guild);
  }),
);
client.on(
  Events.MessageDelete,
  safe((m) => {
    if (m.guildId === process.env.DISCORD_GUILD_ID)
      return bot.log(
        m.guild,
        "Message deleted",
        `Message ${m.id} in <#${m.channelId}>. Author: ${m.author?.id || "unknown"}. Content is not archived.`,
      );
  }),
);
client.on(
  Events.GuildBanAdd,
  safe((b) => {
    if (b.guild.id === process.env.DISCORD_GUILD_ID)
      return bot.log(b.guild, "Ban added", `User ${b.user.id}`);
  }),
);
client.on(
  Events.ChannelCreate,
  safe((ch) => {
    if (ch.guild?.id === process.env.DISCORD_GUILD_ID)
      return bot.log(ch.guild, "Channel created", `${ch.name} (${ch.id})`);
  }),
);
client.on(
  Events.ChannelDelete,
  safe((ch) => {
    if (ch.guild?.id === process.env.DISCORD_GUILD_ID)
      return bot.log(ch.guild, "Channel deleted", `${ch.name} (${ch.id})`);
  }),
);
client.on(Events.Error, (e) => report("warning", { message: explainError(e) }));
client.on(Events.ShardReconnecting, () =>
  report("reconnecting", { message: "Reconnecting to Discord..." }),
);
client.on(Events.ShardResume, () =>
  report("resumed", { message: "Discord connection restored." }),
);
client.on(Events.ShardDisconnect, (event) =>
  report("reconnecting", {
    message: `Discord disconnected (${event.code}). Reconnecting...`,
  }),
);
const health = setInterval(() => {
  if (client.isReady())
    report("stats", {
      ping: client.ws.ping,
      memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
}, 5000);
health.unref();
const timer = setInterval(() => {
  const now = Date.now();
  for (const [key, times] of bot.spam)
    if (times.every((t) => now - t > 8000)) bot.spam.delete(key);
  store.prune();
}, 60000);
timer.unref();
let closing = false;
const shutdown = (code = 0) => {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  clearInterval(health);
  client.destroy();
  store.close();
  process.exit(code);
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => shutdown());
if (process.env.FAINTED_PANEL === "1") {
  const controls = createInterface({ input: process.stdin });
  controls.on("line", (line) => {
    if (line.trim() === "stop") shutdown();
  });
  controls.on("close", shutdown);
}
try {
  report("phase", { message: "Connecting to Discord..." });
  await client.login(process.env.DISCORD_TOKEN);
} catch (e) {
  report("error", { message: explainError(e) });
  shutdown(1);
}
