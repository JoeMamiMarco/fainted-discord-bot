import { randomUUID } from "node:crypto";
import { PermissionFlagsBits as P, ChannelType } from "discord.js";
import { validatePlan } from "./planner.js";

export const templateThemes = {
  gaming: ["general", "looking-for-group", "clips", "game-news"],
  development: ["general", "help", "code-review", "showcase"],
  education: ["questions", "resources", "assignments", "discussion"],
  creators: ["announcements", "community", "feedback", "showcase"],
  support: ["announcements", "faq", "help", "feedback"],
  business: ["announcements", "general", "projects", "resources"],
  study: ["study-plans", "resources", "questions", "accountability"],
  roleplay: ["rules", "characters", "lore", "roleplay"],
  esports: ["team-news", "scrims", "results", "recruitment"],
  marketplace: ["rules", "listings", "questions", "reputation"],
  friends: ["general", "photos", "plans", "memes"],
};
export function preset(theme) {
  if (!Object.hasOwn(templateThemes, theme))
    throw new Error("Unknown template theme.");
  return {
    roles: ["Member"],
    categories: [
      {
        name: "COMMUNITY",
        private: false,
        channels: [
          ...templateThemes[theme].map((name) => ({ name, type: "text" })),
          { name: "Lounge", type: "voice" },
        ],
      },
      {
        name: "STAFF",
        private: true,
        channels: [{ name: "server-logs", type: "text" }],
      },
    ],
  };
}
function keys(value, allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    throw new Error(
      "Unsupported template fields. Permissions, messages, integrations and secrets cannot be imported.",
    );
}
export function cleanTemplate(value) {
  if (typeof value === "string") {
    if (Buffer.byteLength(value) > 128000)
      throw new Error("Template exceeds 128 KB.");
    value = JSON.parse(value);
  }
  if (Buffer.byteLength(JSON.stringify(value) || "") > 128000)
    throw new Error("Template exceeds 128 KB.");
  keys(value, ["format", "version", "name", "plan"]);
  if (
    value.format !== "seep-template" ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 80
  )
    throw new Error("Use a named Seep template version 1.");
  keys(value.plan, ["roles", "categories"]);
  validatePlan(value.plan);
  for (const c of value.plan.categories) {
    keys(c, ["name", "private", "channels"]);
    if (c.channels.length > 50)
      throw new Error("Maximum 50 channels per category.");
    for (const ch of c.channels) keys(ch, ["name", "type"]);
  }
  if (
    value.plan.roles.some((r) =>
      /^(admin|administrator|owner|moderator|staff)$/i.test(r),
    )
  )
    throw new Error(
      "Templates support ordinary roles only. Configure staff permissions explicitly in Discord.",
    );
  return JSON.parse(JSON.stringify(value));
}
export function portable(name, plan) {
  return cleanTemplate({ format: "seep-template", version: 1, name, plan });
}
export async function snapshotTemplate(guild, actor, name = "Server layout") {
  const member =
    actor === "owner"
      ? null
      : await guild.members.fetch({ user: actor, force: true });
  if (member && !member.permissions.has(P.Administrator))
    throw new Error(
      "Administrator is required to copy a complete server structure.",
    );
  await guild.channels.fetch();
  await guild.roles.fetch();
  const types = new Map([
    [0, "text"],
    [2, "voice"],
    [5, "announcement"],
    [13, "stage"],
    [15, "forum"],
    [16, "media"],
  ]);
  const categories = [];
  const parents = [...guild.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition);
  for (const parent of [...parents, null]) {
    const children = [...guild.channels.cache.values()]
      .filter((c) => types.has(c.type) && c.parentId === (parent?.id || null))
      .sort((a, b) => a.rawPosition - b.rawPosition);
    // Split mixed visibility so private channel names are never rebuilt as public.
    for (const privateFlag of [false, true]) {
      const channels = children
        .filter(
          (c) =>
            !c.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel) ===
            privateFlag,
        )
        .map((c) => ({ name: c.name, type: types.get(c.type) }));
      if (channels.length)
        categories.push({
          name:
            (parent?.name || "UNCATEGORIZED") + (privateFlag ? " PRIVATE" : ""),
          private: privateFlag,
          channels,
        });
    }
  }
  return portable(name, { roles: [], categories });
}
export class Templates {
  constructor(store, guild, actor) {
    this.store = store;
    this.guild = guild;
    this.actor = actor;
  }
  list() {
    return this.store
      .items(this.guild, "template:")
      .filter((t) => t.owner === this.actor)
      .map(({ id, name, updated }) => ({ id, name, updated }));
  }
  get(id) {
    const t = this.store.get(this.guild, "template:" + id);
    if (!t || t.owner !== this.actor) throw new Error("Template not found.");
    return t.template;
  }
  save(value) {
    const template = cleanTemplate(value);
    if (this.list().length >= 50)
      throw new Error("Delete an old template before saving more than 50.");
    const id = randomUUID();
    this.store.set(this.guild, "template:" + id, {
      id,
      owner: this.actor,
      name: template.name,
      updated: Date.now(),
      template,
    });
    return { id, ...template };
  }
  remove(id) {
    this.get(id);
    this.store.delete(this.guild, "template:" + id);
    return { deleted: true };
  }
}
