import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits as P,
  MessageFlags,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  duration,
  requirePermission,
  guardTarget,
  guardSelfRole,
  level,
  template,
  violation,
} from "./policy.js";
import { generatePlan, formatPlan, applyPlan } from "./planner.js";

const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);
const button = (id, label, style = ButtonStyle.Primary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const embed = (title, description) =>
  new EmbedBuilder()
    .setColor(0x9c6cff)
    .setTitle(title)
    .setDescription(description.slice(0, 4000))
    .setFooter({ text: "FAINTED • Community & moderation" })
    .setTimestamp();
export class Bot {
  constructor(client, store) {
    this.client = client;
    this.store = store;
    this.spam = new Map();
    this.locks = new Set();
    this.inviteCache = new Map();
  }
  async serial(key, fn) {
    if (this.locks.has(key))
      throw new Error("This action is already running. Try again shortly.");
    this.locks.add(key);
    try {
      return await fn();
    } finally {
      this.locks.delete(key);
    }
  }
  async log(guild, title, text) {
    const id = this.store.config(guild.id).logChannel;
    if (!id) return;
    try {
      const ch = await guild.channels.fetch(id);
      if (
        !ch?.isTextBased() ||
        ch.permissionsFor(guild.roles.everyone).has(P.ViewChannel)
      ) {
        console.warn(
          "Logging skipped: log channel must be private from @everyone.",
        );
        return;
      }
      await ch.send({
        embeds: [embed(title, text)],
        allowedMentions: { parse: [] },
      });
    } catch (e) {
      console.warn(`Log delivery failed: ${e.message}`);
    }
  }
  async record(guild, user, actor, action, reason) {
    const id = this.store.record(guild.id, user, actor, action, reason);
    await this.log(
      guild,
      `Case #${id} · ${action}`,
      `Member: <@${user}> (${user})\nModerator: <@${actor}>\nReason: ${reason}`,
    );
    return id;
  }
  async reply(i, text, extra = {}) {
    return i.editReply({
      content: text,
      allowedMentions: { parse: [] },
      ...extra,
    });
  }
  async handle(i) {
    if (!i.isChatInputCommand() && !i.isButton()) return;
    try {
      if (!i.inGuild() || i.guildId !== process.env.DISCORD_GUILD_ID)
        return i.reply({
          content: "Use this bot in its configured server.",
          flags: MessageFlags.Ephemeral,
        });
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const actor = await i.guild.members.fetch(i.user.id);
      const me = await i.guild.members.fetchMe();
      if (i.isButton()) return await this.component(i, actor, me);
      return await this.command(i, actor, me);
    } catch (e) {
      console.warn(
        `Interaction ${i.commandName || i.customId} failed: ${e.message}`,
      );
      const payload = {
        content: `Could not complete this action: ${e.message}`.slice(0, 1900),
        allowedMentions: { parse: [] },
      };
      if (i.deferred || i.replied) await i.editReply(payload).catch(() => {});
      else
        await i
          .reply({ ...payload, flags: MessageFlags.Ephemeral })
          .catch(() => {});
    }
  }
  async command(i, actor, me) {
    const o = i.options,
      g = i.guild,
      id = g.id,
      name = i.commandName;
    const permissions = {
      warn: P.ModerateMembers,
      history: P.ModerateMembers,
      timeout: P.ModerateMembers,
      untimeout: P.ModerateMembers,
      kick: P.KickMembers,
      ban: P.BanMembers,
      unban: P.BanMembers,
      purge: P.ManageMessages,
      slowmode: P.ManageChannels,
      lock: P.ManageChannels,
      unlock: P.ManageChannels,
      settings: P.ManageGuild,
      analytics: P.ManageGuild,
      "role-panel": P.ManageRoles,
      onboarding: P.ManageGuild,
      poll: P.ManageMessages,
      inactive: P.KickMembers,
      server: P.ManageGuild,
    };
    if (permissions[name]) requirePermission(actor, permissions[name]);
    if (["warn", "timeout", "untimeout", "kick", "ban"].includes(name)) {
      const target = await g.members.fetch(o.getUser("user").id);
      guardTarget(actor, target, me, g.ownerId);
      const reason = o.getString("reason");
      const audit = `${actor.user.tag}: ${reason}`.slice(0, 512);
      if (name === "timeout" || name === "untimeout") {
        if (!target.moderatable)
          throw new Error("The bot cannot timeout this member.");
        await target.timeout(
          name === "timeout" ? duration(o.getString("duration")) : null,
          audit,
        );
      }
      if (name === "kick") {
        if (!target.kickable)
          throw new Error("The bot cannot kick this member.");
        await target.kick(audit);
      }
      if (name === "ban") {
        if (!target.bannable)
          throw new Error("The bot cannot ban this member.");
        await target.ban({ reason: audit, deleteMessageSeconds: 0 });
      }
      const caseId = await this.record(g, target.id, actor.id, name, reason);
      return this.reply(
        i,
        `${name} completed for <@${target.id}>. Case #${caseId}.`,
      );
    }
    if (name === "history") {
      const records = this.store.cases(id, o.getUser("user").id);
      return this.reply(i, "", {
        embeds: [
          embed(
            "Moderation history",
            records
              .map(
                (x) =>
                  `**#${x.id} ${x.action}** · <t:${Math.floor(x.time / 1000)}:d>\n${x.reason}`,
              )
              .join("\n\n") || "No recorded cases.",
          ),
        ],
      });
    }
    if (name === "unban") {
      const user = o.getString("user_id");
      if (!/^\d{17,20}$/.test(user)) throw new Error("Enter a valid user ID.");
      await g.bans.remove(user, o.getString("reason"));
      await this.record(g, user, actor.id, "unban", o.getString("reason"));
      return this.reply(i, "Ban removed.");
    }
    if (["purge", "slowmode", "lock", "unlock"].includes(name)) {
      if (i.channel.type !== ChannelType.GuildText)
        throw new Error("Use this command in a normal text channel.");
      if (!i.channel.permissionsFor(actor).has(permissions[name]))
        throw new Error("You lack permission in this channel.");
      if (name === "purge") {
        const deleted = await i.channel.bulkDelete(o.getInteger("count"), true);
        await this.log(
          g,
          "Messages purged",
          `${actor.id} removed ${deleted.size} messages in <#${i.channelId}>.`,
        );
        return this.reply(
          i,
          `Deleted ${deleted.size} messages. Messages older than 14 days are skipped.`,
        );
      }
      if (name === "slowmode") {
        await i.channel.setRateLimitPerUser(
          o.getInteger("seconds"),
          `By ${actor.id}`,
        );
        return this.reply(i, "Slowmode updated.");
      }
      return this.serial(`lock:${i.channelId}`, async () => {
        const key = `lock:${i.channelId}`;
        if (name === "lock") {
          if (this.store.get(id, key))
            throw new Error("This channel is already locked by Fainted.");
          const overwrite = i.channel.permissionOverwrites.cache.get(id);
          const previous = overwrite?.allow.has(P.SendMessages)
            ? true
            : overwrite?.deny.has(P.SendMessages)
              ? false
              : null;
          this.store.set(id, key, { previous });
          try {
            await i.channel.permissionOverwrites.edit(
              id,
              { SendMessages: false },
              { reason: `Locked by ${actor.id}` },
            );
          } catch (e) {
            this.store.delete(id, key);
            throw e;
          }
        } else {
          const saved = this.store.get(id, key);
          if (!saved)
            throw new Error("No saved Fainted lock exists for this channel.");
          await i.channel.permissionOverwrites.edit(
            id,
            { SendMessages: saved.previous },
            { reason: `Unlocked by ${actor.id}` },
          );
          this.store.delete(id, key);
        }
        await this.log(g, name, `<#${i.channelId}> by <@${actor.id}>`);
        return this.reply(
          i,
          `${name} complete. Role-specific overrides and administrators may still allow sending.`,
        );
      });
    }
    if (name === "settings") return this.settings(i, me);
    if (name === "rank") {
      const user = o.getUser("user") || i.user,
        member = this.store.member(id, user.id);
      return this.reply(
        i,
        `${user.username}: **Level ${level(member.xp)}** · ${member.xp} XP`,
      );
    }
    if (name === "leaderboard")
      return this.reply(i, "", {
        embeds: [
          embed(
            "XP leaderboard",
            this.store
              .leaderboard(id)
              .map(
                (x, j) =>
                  `${j + 1}. <@${x.user}> — ${x.xp} XP · level ${level(x.xp)}`,
              )
              .join("\n") || "No XP recorded yet.",
          ),
        ],
      });
    if (name === "invites" || name === "invite-leaderboard") {
      const rows = this.store.db
        .prepare(
          "SELECT inviter,COUNT(*) count FROM joins WHERE guild=? AND inviter IS NOT NULL GROUP BY inviter ORDER BY count DESC",
        )
        .all(id);
      return this.reply(
        i,
        name === "invites"
          ? `Known unique referrals: **${rows.find((x) => x.inviter === (o.getUser("user") || i.user).id)?.count || 0}**. Ambiguous joins are not attributed.`
          : rows
              .slice(0, 10)
              .map(
                (x, j) =>
                  `${j + 1}. <@${x.inviter}> — ${x.count} unique referrals`,
              )
              .join("\n") || "No known invite referrals yet.",
      );
    }
    if (name === "analytics") {
      const days = o.getInteger("days") || 30,
        a = this.store.analytics(id, days);
      const csv =
        "date,messages\n" +
        a.daily.map((x) => `${x.day},${x.messages}`).join("\n");
      return this.reply(i, "", {
        embeds: [
          embed(
            `Activity · ${days} days`,
            `${a.messages} messages · ${a.active} active members\n\nCollected since <t:${Math.floor(this.store.get(id, "observedSince", Date.now()) / 1000)}:f>. Counts only messages observed while online; no historical backfill.`,
          ),
        ],
        files: [
          new AttachmentBuilder(Buffer.from(csv), { name: "activity.csv" }),
        ],
      });
    }
    if (name === "role-panel" || name === "onboarding") {
      const role = o.getRole("role");
      if (role) {
        requirePermission(actor, P.ManageRoles);
        guardSelfRole(role, me);
        if (
          actor.id !== g.ownerId &&
          actor.roles.highest.comparePositionTo(role) <= 0
        )
          throw new Error("Your role must be above the offered role.");
      }
      const title =
        name === "onboarding" ? "Welcome · Get started" : o.getString("label");
      const message = await i.channel.send({
        embeds: [
          embed(
            title,
            name === "onboarding"
              ? o.getString("rules")
              : `Use the button or reaction to toggle <@&${role.id}>.`,
          ),
        ],
        components: [
          row(
            button(
              "selfrole",
              name === "onboarding" ? "I accept the rules" : "Toggle role",
            ),
          ),
        ],
        allowedMentions: { parse: [] },
      });
      const emoji = name === "role-panel" ? o.getString("emoji") || "✅" : null;
      this.store.set(id, `panel:${message.id}`, {
        role: role?.id || null,
        emoji,
        onboarding: name === "onboarding",
      });
      let note = "";
      if (emoji)
        try {
          await message.react(emoji);
        } catch {
          note =
            " The reaction could not be added; the button works. Use a single Unicode emoji next time.";
        }
      return this.reply(i, `Panel posted.${note}`);
    }
    if (name === "ticket") {
      if (o.getSubcommand() === "panel") {
        requirePermission(actor, P.ManageGuild);
        if (!this.store.config(id).supportRole)
          throw new Error("Set a support role with /settings roles first.");
        await i.channel.send({
          embeds: [
            embed(
              "Support desk",
              "Need help? Open a private ticket. One open ticket per member.",
            ),
          ],
          components: [row(button("ticket:create", "Open ticket"))],
        });
        return this.reply(i, "Ticket panel posted.");
      }
      return this.closeTicket(i, actor);
    }
    if (name === "poll") {
      if (o.getSubcommand() === "create") {
        const answers = o
          .getString("options")
          .split("|")
          .map((x) => x.trim());
        if (
          answers.length < 2 ||
          answers.length > 5 ||
          answers.some((x) => !x || x.length > 80) ||
          new Set(answers).size !== answers.length
        )
          throw new Error(
            "Use 2–5 different answers, each 1–80 characters, separated by |.",
          );
        const poll = {
          question: o.getString("question"),
          answers,
          votes: {},
          closed: false,
        };
        const message = await i.channel.send(this.pollPayload(poll));
        this.store.set(id, `poll:${message.id}`, poll);
        return this.reply(i, "Poll created. Members can change their vote.");
      }
      const messageId = o.getString("message_id");
      return this.serial(`poll:${messageId}`, async () => {
        const poll = this.store.get(id, `poll:${messageId}`);
        if (!poll) throw new Error("Poll not found. Use its original channel.");
        const message = await i.channel.messages.fetch(messageId);
        poll.closed = true;
        this.store.set(id, `poll:${messageId}`, poll);
        await message.edit(this.pollPayload(poll));
        return this.reply(i, "Poll closed.");
      });
    }
    if (name === "inactive") {
      if (this.capabilities?.members === false)
        throw new Error(
          "Enable Server Members Intent in Developer Portal > Bot and restart before reviewing inactive members.",
        );
      const days = o.getInteger("days"),
        cutoff = Date.now() - days * 86400000;
      if (this.store.get(id, "observedSince", Date.now()) > cutoff)
        throw new Error(
          `Not enough observation history. Wait until the bot has been installed for ${days} days.`,
        );
      await g.members.fetch();
      const candidates = g.members.cache
        .filter(
          (m) =>
            !m.user.bot &&
            m.joinedTimestamp < cutoff &&
            this.store.member(id, m.id).last_seen < cutoff &&
            m.roles.cache.size === 1 &&
            m.kickable,
        )
        .filter((m) => {
          try {
            guardTarget(actor, m, me, g.ownerId);
            return true;
          } catch {
            return false;
          }
        })
        .first(10);
      if (!candidates.length)
        return this.reply(
          i,
          "No eligible inactive members. Members with assigned roles are excluded.",
        );
      const key = randomUUID();
      this.store.set(id, `pending:${key}`, {
        kind: "inactive",
        actor: actor.id,
        expires: Date.now() + 300000,
        cutoff,
        users: candidates.map((m) => m.id),
      });
      return this.reply(
        i,
        `Review these ${candidates.length} members before kicking:\n${candidates.map((m) => `<@${m.id}> (${m.id})`).join("\n")}\n\nNo messages observed for ${days} days. Offline periods and inaccessible channels can make this incomplete.`,
        {
          components: [
            row(
              button(
                `confirm:${key}`,
                "Kick listed members",
                ButtonStyle.Danger,
              ),
            ),
          ],
        },
      );
    }
    if (name === "server") {
      if (o.getSubcommand() === "snapshot") {
        await g.channels.fetch();
        await g.roles.fetch();
        const snapshot = {
          roles: g.roles.cache
            .filter((x) => x.id !== g.id && !x.managed)
            .map((x) => x.name)
            .slice(0, 8),
          categories: g.channels.cache
            .filter((x) => x.type === ChannelType.GuildCategory)
            .map((x) => ({
              name: x.name,
              private: !x.permissionsFor(g.roles.everyone).has(P.ViewChannel),
              channels: g.channels.cache
                .filter((c) => c.parentId === x.id && [0, 2].includes(c.type))
                .map((c) => ({
                  name: c.name,
                  type: c.type === 2 ? "voice" : "text",
                })),
            })),
        };
        return this.reply(
          i,
          "Layout names exported. Permissions, messages, and channels outside categories are not copied.",
          {
            files: [
              new AttachmentBuilder(
                Buffer.from(JSON.stringify(snapshot, null, 2)),
                { name: "server-layout.json" },
              ),
            ],
          },
        );
      }
      const ai = o.getBoolean("ai") || false,
        plan = await generatePlan(
          o.getString("description"),
          ai,
          o.getAttachment("screenshot"),
        );
      const key = randomUUID();
      this.store.set(id, `pending:${key}`, {
        kind: "plan",
        actor: actor.id,
        expires: Date.now() + 600000,
        plan,
      });
      return this.reply(
        i,
        `${ai ? "AI-generated" : "Template"} plan · preview only. Build adds missing channels and normal roles, and connects welcome/private logs if present. Private areas are visible to administrators and the configured support role.`,
        {
          embeds: [embed("Your server plan", formatPlan(plan))],
          files: [
            new AttachmentBuilder(Buffer.from(JSON.stringify(plan, null, 2)), {
              name: "plan.json",
            }),
          ],
          components: [row(button(`confirm:${key}`, "Build this plan"))],
        },
      );
    }
    if (name === "help")
      return this.reply(i, "", {
        embeds: [
          embed(
            "Fainted · Command guide",
            "**Moderation**\n/warn /history /timeout /untimeout /kick /ban /unban /purge /slowmode /lock /unlock /inactive\n\n**Setup**\n/settings channels · roles · messages · automod · leveling · clear\n/server plan · snapshot\n\n**Community**\n/role-panel /onboarding /ticket panel /ticket close\n/poll create · close /rank /leaderboard\n/invites /invite-leaderboard /analytics\n\nCommands check your Discord permissions. Server builds and inactive kicks require reviewing a preview.",
          ),
        ],
      });
  }
  async settings(i, me) {
    const o = i.options,
      id = i.guildId,
      sub = o.getSubcommand(),
      patch = {};
    if (sub === "show")
      return this.reply(
        i,
        `Settings:\n\`\`\`json\n${JSON.stringify(this.store.config(id), null, 2)}\n\`\`\``,
      );
    if (sub === "clear") patch[o.getString("setting")] = null;
    if (sub === "channels")
      for (const [opt, key] of [
        ["welcome", "welcomeChannel"],
        ["goodbye", "goodbyeChannel"],
        ["logs", "logChannel"],
      ]) {
        const ch = o.getChannel(opt);
        if (!ch) continue;
        if (
          !ch
            .permissionsFor(me)
            .has([P.ViewChannel, P.SendMessages, P.EmbedLinks])
        )
          throw new Error(
            `The bot needs View Channel, Send Messages, and Embed Links in ${ch.name}.`,
          );
        if (
          opt === "logs" &&
          ch.permissionsFor(i.guild.roles.everyone).has(P.ViewChannel)
        )
          throw new Error("Choose a private staff channel for logs.");
        patch[key] = ch.id;
      }
    if (sub === "roles") {
      const auto = o.getRole("auto"),
        support = o.getRole("support");
      if (auto) {
        guardSelfRole(auto, me);
        patch.autoRole = auto.id;
      }
      if (support) {
        if (support.id === id || support.managed)
          throw new Error(
            "Choose a dedicated staff support role, not @everyone or a managed role.",
          );
        patch.supportRole = support.id;
      }
    }
    if (sub === "messages")
      for (const key of ["welcome", "goodbye"])
        if (o.getString(key) !== null) patch[key] = o.getString(key);
    if (sub === "leveling") patch.leveling = o.getBoolean("enabled");
    if (sub === "automod") {
      if (o.getBoolean("enabled") && this.capabilities?.content === false)
        throw new Error(
          "Enable Message Content Intent in Developer Portal > Bot and restart before enabling AutoMod.",
        );
      patch.automod = o.getBoolean("enabled");
      for (const [opt, key, get] of [
        ["block_invites", "blockInvites", "getBoolean"],
        ["mentions", "mentionLimit", "getInteger"],
        ["spam", "spamLimit", "getInteger"],
      ])
        if (o[get](opt) !== null) patch[key] = o[get](opt);
      if (o.getString("words") !== null)
        patch.blockedWords =
          o.getString("words").toLowerCase() === "none"
            ? []
            : o
                .getString("words")
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
    }
    this.store.configure(id, patch);
    return this.reply(i, "Settings saved.");
  }
  pollPayload(poll) {
    const counts = poll.answers.map(
      (_, j) => Object.values(poll.votes).filter((v) => v === j).length,
    );
    return {
      embeds: [
        embed(
          poll.question,
          poll.answers
            .map((x, j) => `${j + 1}. ${x} — **${counts[j]}** votes`)
            .join("\n") +
            `\n\n${poll.closed ? "Voting closed" : "One vote per member. Click again to change your vote."}`,
        ),
      ],
      components: [
        row(
          ...poll.answers.map((_, j) =>
            button(
              `vote:${j}`,
              String(j + 1),
              ButtonStyle.Secondary,
            ).setDisabled(poll.closed),
          ),
        ),
      ],
      allowedMentions: { parse: [] },
    };
  }
  async component(i, actor, me) {
    const id = i.guildId,
      g = i.guild,
      key = i.customId;
    if (key === "selfrole") {
      return this.serial(`role:${id}:${actor.id}`, async () => {
        const panel = this.store.get(id, `panel:${i.message.id}`);
        if (!panel) throw new Error("Panel not found.");
        if (panel.role) {
          const role = await g.roles.fetch(panel.role);
          guardSelfRole(role, me);
          if (!panel.onboarding && actor.roles.cache.has(role.id))
            await actor.roles.remove(role, "Self-role panel");
          else await actor.roles.add(role, "Self-role/onboarding panel");
        }
        if (panel.onboarding)
          this.store.set(id, `onboarded:${actor.id}`, Date.now());
        return this.reply(
          i,
          panel.onboarding
            ? "Rules accepted. Welcome!"
            : "Your role was updated.",
        );
      });
    }
    if (key.startsWith("vote:"))
      return this.serial(`poll:${i.message.id}`, async () => {
        const poll = this.store.get(id, `poll:${i.message.id}`);
        if (!poll || poll.closed)
          throw new Error("This poll is closed or unavailable.");
        const choice = Number(key.split(":")[1]);
        if (
          !Number.isInteger(choice) ||
          choice < 0 ||
          choice >= poll.answers.length
        )
          throw new Error("Invalid option.");
        poll.votes[actor.id] = choice;
        this.store.set(id, `poll:${i.message.id}`, poll);
        await i.message.edit(this.pollPayload(poll));
        return this.reply(i, `Vote recorded: ${poll.answers[choice]}`);
      });
    if (key === "ticket:create") return this.openTicket(i, actor, me);
    if (key === "ticket:close") return this.closeTicket(i, actor);
    if (key.startsWith("confirm:"))
      return this.serial(`pending:${id}:${key}`, async () => {
        const pendingKey = `pending:${key.slice(8)}`,
          pending = this.store.get(id, pendingKey);
        if (!pending || pending.expires < Date.now())
          throw new Error("This preview has expired. Create another.");
        if (pending.actor !== actor.id)
          throw new Error(
            "Only the person who requested this preview can confirm it.",
          );
        if (pending.started)
          throw new Error(
            "This preview has already been used. Create a fresh preview to continue.",
          );
        requirePermission(
          actor,
          pending.kind === "plan" ? P.ManageGuild : P.KickMembers,
        );
        this.store.set(id, pendingKey, { ...pending, started: true });
        if (pending.kind === "plan") {
          return this.serial(`build:${id}`, async () => {
            let result;
            try {
              result = await applyPlan(
                g,
                pending.plan,
                this.store.config(id).supportRole,
                (created) =>
                  this.store.set(id, pendingKey, {
                    ...pending,
                    started: true,
                    created,
                  }),
              );
            } catch (e) {
              const created = this.store.get(id, pendingKey).created || [];
              throw new Error(
                `${e.message} ${created.length} items were created before stopping. Existing items remain; generate a new plan to retry.`,
              );
            }
            const patch = {};
            if (result.welcomeChannel)
              patch.welcomeChannel = result.welcomeChannel;
            if (result.logChannel) patch.logChannel = result.logChannel;
            this.store.configure(id, patch);
            await this.log(
              g,
              "Server plan built",
              `${actor.id} created ${result.created.length} items.`,
            );
            await i.message.edit({ components: [] }).catch(() => {});
            return this.reply(
              i,
              `Built your plan: ${result.created.length} new items. Use /settings automod to enable filters and /settings roles to set automatic roles.`,
            );
          });
        }
        let kicked = 0;
        const skipped = [];
        for (const uid of pending.users) {
          try {
            const member = await g.members.fetch(uid);
            guardTarget(actor, member, me, g.ownerId);
            if (
              member.user.bot ||
              member.roles.cache.size > 1 ||
              this.store.member(id, uid).last_seen >= pending.cutoff ||
              member.joinedTimestamp >= pending.cutoff
            )
              throw new Error("No longer eligible");
            await member.kick("Confirmed inactive-member review");
            kicked++;
            await this.record(
              g,
              uid,
              actor.id,
              "inactive kick",
              "Confirmed inactive-member review",
            );
          } catch {
            skipped.push(uid);
          }
        }
        await i.message.edit({ components: [] }).catch(() => {});
        return this.reply(
          i,
          `Kicked ${kicked}; skipped ${skipped.length} members after rechecking eligibility.`,
        );
      });
    throw new Error("Unknown or outdated button.");
  }
  async openTicket(i, actor, me) {
    return this.serial(`ticket:${i.guildId}:${actor.id}`, async () => {
      const g = i.guild,
        id = g.id,
        config = this.store.config(id);
      if (!config.supportRole)
        throw new Error(
          "An administrator must configure a support role first.",
        );
      const support = await g.roles.fetch(config.supportRole).catch(() => null);
      if (!support || support.id === id)
        throw new Error(
          "An administrator must configure a support role first.",
        );
      const old = this.store.get(id, `ticket-user:${actor.id}`);
      if (old && (await g.channels.fetch(old).catch(() => null)))
        return this.reply(i, `You already have a ticket: <#${old}>.`);
      const ch = await g.channels.create({
        name: `ticket-${actor.id.slice(-6)}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id, deny: [P.ViewChannel] },
          {
            id: actor.id,
            allow: [
              P.ViewChannel,
              P.SendMessages,
              P.ReadMessageHistory,
              P.AttachFiles,
            ],
          },
          {
            id: support.id,
            allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory],
          },
          {
            id: me.id,
            allow: [
              P.ViewChannel,
              P.SendMessages,
              P.ReadMessageHistory,
              P.ManageChannels,
            ],
          },
        ],
        reason: "Member opened a support ticket",
      });
      this.store.set(id, `ticket:${ch.id}`, {
        owner: actor.id,
        support: support.id,
        closed: false,
      });
      this.store.set(id, `ticket-user:${actor.id}`, ch.id);
      await ch.send({
        embeds: [
          embed(
            "Your private support ticket",
            `<@${actor.id}>, describe what you need help with. Staff can read this channel. Closing hides it from you and retains the history for staff.`,
          ),
        ],
        components: [
          row(button("ticket:close", "Close ticket", ButtonStyle.Secondary)),
        ],
        allowedMentions: { parse: [] },
      });
      await this.log(g, "Ticket opened", `<#${ch.id}> by <@${actor.id}>`);
      return this.reply(i, `Your ticket is ready: <#${ch.id}>.`);
    });
  }
  async closeTicket(i, actor) {
    return this.serial(`ticket-close:${i.channelId}`, async () => {
      const ticket = this.store.get(i.guildId, `ticket:${i.channelId}`);
      if (!ticket || ticket.closed)
        throw new Error("This is not an open ticket.");
      if (
        actor.id !== ticket.owner &&
        !actor.permissions.has(P.ManageChannels) &&
        !actor.roles.cache.has(ticket.support)
      )
        throw new Error("Only the ticket owner or support staff can close it.");
      await i.channel.permissionOverwrites.edit(ticket.owner, {
        ViewChannel: false,
        SendMessages: false,
      });
      ticket.closed = true;
      this.store.set(i.guildId, `ticket:${i.channelId}`, ticket);
      this.store.delete(i.guildId, `ticket-user:${ticket.owner}`);
      await i.channel
        .setName(`closed-${ticket.owner.slice(-6)}`)
        .catch(() => {});
      await this.log(
        i.guild,
        "Ticket closed",
        `<#${i.channelId}> by <@${actor.id}>. History retained for staff.`,
      );
      return this.reply(i, "Ticket closed; staff retain the channel history.");
    });
  }
  async message(message, edited = false) {
    if (
      !message.guild ||
      message.guildId !== process.env.DISCORD_GUILD_ID ||
      message.author?.bot
    )
      return;
    const id = message.guildId,
      config = this.store.config(id),
      key = `${id}:${message.author.id}`,
      now = Date.now();
    let recent = this.spam.get(key) || [];
    recent = recent.filter((t) => now - t < 8000);
    if (!edited) {
      recent.push(now);
      this.spam.set(key, recent);
    }
    const member =
      message.member || (await message.guild.members.fetch(message.author.id));
    const exempt =
      member.permissions.has(P.ManageMessages) ||
      member.permissions.has(P.Administrator);
    const cause = exempt
      ? null
      : violation(
          message.content,
          message.mentions.users.size +
            message.mentions.roles.size +
            (message.mentions.everyone ? config.mentionLimit : 0),
          recent.length,
          config,
        );
    if (cause) {
      try {
        await message.delete();
        await this.record(
          message.guild,
          member.id,
          this.client.user.id,
          "automod delete",
          cause,
        );
      } catch (e) {
        await this.log(
          message.guild,
          "AutoMod could not delete",
          `Message ${message.id}: ${e.message}`,
        );
      }
      return;
    }
    if (!edited) this.store.message(id, member.id, config.leveling);
  }
  async reaction(reaction, user, added) {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    const g = reaction.message.guild;
    if (!g || g.id !== process.env.DISCORD_GUILD_ID) return;
    const panel = this.store.get(g.id, `panel:${reaction.message.id}`);
    if (!panel?.role || !panel.emoji || reaction.emoji.name !== panel.emoji)
      return;
    return this.serial(`role:${g.id}:${user.id}`, async () => {
      const member = await g.members.fetch(user.id),
        me = await g.members.fetchMe(),
        role = await g.roles.fetch(panel.role);
      guardSelfRole(role, me);
      if (added) await member.roles.add(role, "Reaction role");
      else await member.roles.remove(role, "Reaction role removed");
    });
  }
  async refreshInvites(guild) {
    try {
      const invites = await guild.invites.fetch();
      const snapshot = new Map(
        invites.map((x) => [
          x.code,
          { uses: x.uses || 0, inviter: x.inviter?.id || null },
        ]),
      );
      this.inviteCache.set(guild.id, snapshot);
      return snapshot;
    } catch {
      this.inviteCache.delete(guild.id);
      return null;
    }
  }
  async joined(member) {
    const g = member.guild,
      id = g.id;
    if (id !== process.env.DISCORD_GUILD_ID) return;
    const config = this.store.config(id);
    // Ambiguous simultaneous joins, expired one-use links, vanity URLs, and offline joins are unknown.
    await this.serial(`invites:${id}`, async () => {
      const previous = this.inviteCache.get(id),
        current = await this.refreshInvites(g);
      let inviter = null;
      if (previous && current) {
        const changed = [...current].filter(
          ([code, x]) => previous.has(code) && x.uses > previous.get(code).uses,
        );
        if (
          changed.length === 1 &&
          changed[0][1].uses - previous.get(changed[0][0]).uses === 1
        )
          inviter = changed[0][1].inviter;
      }
      this.store.db
        .prepare("INSERT OR IGNORE INTO joins VALUES (?,?,?,?)")
        .run(id, member.id, inviter === member.id ? null : inviter, Date.now());
    }).catch((e) => console.warn(`Invite attribution skipped: ${e.message}`));
    if (config.autoRole && !member.user.bot)
      try {
        const role = await g.roles.fetch(config.autoRole),
          me = await g.members.fetchMe();
        guardSelfRole(role, me);
        await member.roles.add(role, "Automatic join role");
      } catch (e) {
        await this.log(g, "Auto role failed", `${member.id}: ${e.message}`);
      }
    if (config.welcomeChannel)
      try {
        const ch = await g.channels.fetch(config.welcomeChannel);
        await ch.send({
          content: template(config.welcome, member),
          allowedMentions: { users: [member.id], parse: [] },
        });
      } catch (e) {
        console.warn(`Welcome failed: ${e.message}`);
      }
    await this.log(g, "Member joined", `<@${member.id}> (${member.id})`);
  }
  async left(member) {
    if (member.guild.id !== process.env.DISCORD_GUILD_ID) return;
    const config = this.store.config(member.guild.id);
    if (config.goodbyeChannel)
      try {
        const ch = await member.guild.channels.fetch(config.goodbyeChannel);
        await ch.send({
          content: template(config.goodbye, member),
          allowedMentions: { parse: [] },
        });
      } catch (e) {
        console.warn(`Goodbye failed: ${e.message}`);
      }
    await this.log(
      member.guild,
      "Member left",
      `${member.user.username} (${member.id})`,
    );
  }
}
