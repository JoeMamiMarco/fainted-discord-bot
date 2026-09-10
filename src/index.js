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
import { Features } from "./features.js";
import { authorizeAction, filterSnapshot } from "./member-access.js";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
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
    I.GuildVoiceStates,
    I.GuildScheduledEvents,
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
const featureInstances = new Map();
const featuresFor = (id = process.env.DISCORD_GUILD_ID) => {
  if (!id || !client.guilds.cache.has(id))
    throw new Error("seep must be invited to this server first.");
  if (!featureInstances.has(id))
    featureInstances.set(id, new Features(client, store, bot, id));
  return featureInstances.get(id);
};
async function dashboardAction(action, payload = {}) {
  if (action === "guilds") return [...client.guilds.cache.keys()];
  if (action === "member-authorize" || action === "member-action") {
    const f = featuresFor(payload.guildId),
      g = await f.guild();
    let checked = payload.payload || {};
    if (["giveaway-end", "giveaway-reroll"].includes(payload.action)) {
      const item = store.get(g.id, `giveaway:${checked.id}`);
      if (!item) throw new Error("Giveaway not found.");
      checked = { ...checked, channel: item.channel };
    }
    const member = await authorizeAction(
      g,
      payload.userId,
      action === "member-authorize" ? "chat" : payload.action,
      checked,
    );
    if (action === "member-authorize") return { allowed: true };
    const result = await f.action(
      payload.action,
      payload.payload,
      payload.userId,
    );
    return payload.action === "snapshot"
      ? filterSnapshot(result, g, member)
      : result;
  }
  return featuresFor().action(action, payload);
}
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
    client.user.setActivity("/help â€¢ seep moderation", {
      type: ActivityType.Watching,
    });
    console.log(`seep is online as ${client.user.tag} in ${guild.name}.`);
    report("online", {
      bot: client.user.tag,
      server: guild.name,
      limited: !capabilities.members || !capabilities.content,
    });
    try {
      const avatar = "assets/seep-logo.png";
      if (existsSync(avatar)) {
        const bytes = readFileSync(avatar),
          hash = createHash("sha256").update(bytes).digest("hex");
        if (store.get(guild.id, "brand-logo") !== hash) {
          await client.user.setAvatar(bytes);
          if (client.user.username !== "seep")
            await client.user.setUsername("seep");
          store.set(guild.id, "brand-logo", hash);
        }
      }
    } catch (e) {
      report("warning", { message: "Logo update: " + explainError(e) });
    }
    for (const g of client.guilds.cache.values()) {
      featuresFor(g.id);
      if (!store.get(g.id, "observedSince"))
        store.set(g.id, "observedSince", Date.now());
      if (g.id !== guild.id) await bot.refreshInvites(g);
    }
  } catch (e) {
    report("error", { message: explainError(e) });
    shutdown(1);
  }
});
client.on(
  Events.InteractionCreate,
  safe(async (i) => {
    if (!(await (i.guildId ? featuresFor(i.guildId).interaction(i) : false)))
      await bot.handle(i);
  }),
);
client.on(
  Events.MessageCreate,
  safe(async (m) => {
    if (await bot.message(m)) await featuresFor(m.guildId).message(m);
  }),
);
client.on(
  Events.MessageUpdate,
  safe(async (_, m) => {
    if (m.partial) await m.fetch();
    if (capabilities.content) await bot.message(m, true);
    if (!!m.guildId)
      await bot.log(
        m.guild,
        "Message edited",
        `Message ${m.id} in <#${m.channelId}>. Author: ${m.author?.id || "unknown"}.`,
      );
  }),
);
client.on(
  Events.MessageReactionAdd,
  safe(async (r, u) => {
    await bot.reaction(r, u, true);
    await featuresFor(r.message.guildId).reaction(r, u, true);
  }),
);
client.on(
  Events.MessageReactionRemove,
  safe(async (r, u) => {
    await bot.reaction(r, u, false);
    await featuresFor(r.message.guildId).reaction(r, u, false);
  }),
);
client.on(
  Events.GuildMemberAdd,
  safe(async (m) => {
    await bot.joined(m);
    await featuresFor(m.guild.id).joined(m);
  }),
);
client.on(
  Events.GuildMemberRemove,
  safe(async (m) => {
    await bot.left(m);
    await featuresFor(m.guild.id).left(m);
  }),
);
client.on(
  Events.InviteCreate,
  safe((invite) => {
    if (!!invite.guild?.id) return bot.refreshInvites(invite.guild);
  }),
);
client.on(
  Events.InviteDelete,
  safe((invite) => {
    if (!!invite.guild?.id) return bot.refreshInvites(invite.guild);
  }),
);
client.on(
  Events.MessageDelete,
  safe((m) => {
    if (!!m.guildId)
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
    if (!!b.guild.id) return bot.log(b.guild, "Ban added", `User ${b.user.id}`);
  }),
);
client.on(
  Events.ChannelCreate,
  safe((ch) => {
    if (!!ch.guild?.id)
      return bot.log(ch.guild, "Channel created", `${ch.name} (${ch.id})`);
  }),
);
client.on(
  Events.ChannelDelete,
  safe((ch) => {
    if (!!ch.guild?.id)
      return bot.log(ch.guild, "Channel deleted", `${ch.name} (${ch.id})`);
  }),
);
client.on(
  Events.GuildCreate,
  safe(async (guild) => {
    featuresFor(guild.id);
    store.set(guild.id, "observedSince", Date.now());
    await bot.refreshInvites(guild);
    await guild.commands.set(commands);
  }),
);
client.on(Events.GuildDelete, (guild) => featureInstances.delete(guild.id));
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
client.on(
  Events.VoiceStateUpdate,
  safe((old, next) => featuresFor(next.guild.id).voice(old, next)),
);
client.on(
  Events.GuildAuditLogEntryCreate,
  safe((entry, guild) => featuresFor(guild.id).audit(entry, guild)),
);
client.on(
  Events.GuildMemberUpdate,
  safe(async (old, member) => {
    if (
      old.roles.cache
        .map((r) => r.id)
        .sort()
        .join() !==
      member.roles.cache
        .map((r) => r.id)
        .sort()
        .join()
    )
      await bot.log(
        member.guild,
        "Member roles updated",
        `<@${member.id}> Â· roles: ${member.roles.cache
          .filter((r) => r.id !== member.guild.id)
          .map((r) => r.name)
          .join(", ")}`,
      );
  }),
);
const featureTimer = setInterval(
  () =>
    Promise.allSettled(
      [...client.guilds.cache.keys()].map((id) => featuresFor(id).tick()),
    ).then((results) => {
      for (const x of results)
        if (x.status === "rejected")
          console.warn(`Scheduled task: ${x.reason.message}`);
    }),
  15000,
);
featureTimer.unref();
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
  clearInterval(featureTimer);
  client.destroy();
  store.close();
  process.exit(code);
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => shutdown());
if (process.env.SEEP_PANEL === "1") {
  const controls = createInterface({ input: process.stdin });
  controls.on("line", (line) => {
    if (line.trim() === "stop") shutdown();
    else if (line.startsWith("@@REQUEST ") && line.length < 80000) {
      let request;
      try {
        request = JSON.parse(line.slice(10));
      } catch {
        return;
      }
      if (typeof request.id !== "string" || request.id.length > 50) return;
      dashboardAction(request.action, request.payload)
        .then((result) => report("response", { id: request.id, result }))
        .catch((e) =>
          report("response", { id: request.id, error: explainError(e) }),
        );
    }
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
