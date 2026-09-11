import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PermissionsBitField,
  PermissionFlagsBits as P,
  Collection,
} from "discord.js";
import { Store } from "../src/store.js";
import {
  duration,
  guardTarget,
  guardSelfRole,
  violation,
  level,
} from "../src/policy.js";
import { validatePlan, templatePlan, applyPlan } from "../src/planner.js";
import { commands } from "../src/commands.js";
import { Bot } from "../src/bot.js";
import { checkEnv } from "../src/check.js";

const highest = (position) => ({
  position,
  comparePositionTo(other) {
    return position - other.position;
  },
});
const member = (id, position) => ({
  id,
  roles: { highest: highest(position) },
});
test("moderation cannot cross owner, actor, bot, or equal-role boundaries", () => {
  const actor = member("a", 5),
    me = member("bot", 9);
  for (const target of [
    member("owner", 1),
    member("a", 1),
    member("bot", 1),
    member("peer", 5),
    member("high", 10),
  ])
    assert.throws(() => guardTarget(actor, target, me, "owner"));
  assert.doesNotThrow(() => guardTarget(actor, member("low", 2), me, "owner"));
  assert.doesNotThrow(() =>
    guardTarget(member("owner", 1), member("high", 8), me, "owner"),
  );
});
test("timeout duration is bounded by Discord maximum", () => {
  assert.equal(duration("10m"), 600000);
  assert.equal(duration("28d"), 2419200000);
  for (const value of ["0s", "29d", "-1h", "10", "999999999999999d", "1.5h"])
    assert.throws(() => duration(value));
});
test("self-role rejects staff permissions even after panel creation", () => {
  const role = {
    id: "role",
    guild: { id: "g" },
    managed: false,
    editable: true,
    comparePositionTo: () => -1,
    permissions: new PermissionsBitField(),
  };
  guardSelfRole(role, member("bot", 10));
  for (const p of [
    P.Administrator,
    P.ManageRoles,
    P.ManageMessages,
    P.BanMembers,
  ]) {
    role.permissions = new PermissionsBitField(p);
    assert.throws(() => guardSelfRole(role, member("bot", 10)));
  }
});
test("automod handles threshold, links, keywords, and disabled mode", () => {
  const config = {
    automod: true,
    mentionLimit: 6,
    spamLimit: 6,
    blockInvites: true,
    blockedWords: ["badword"],
  };
  assert.equal(violation("hello", 0, 1, config), null);
  assert.equal(
    violation("https://discord.gg/test", 0, 1, config),
    "Discord invite link",
  );
  assert.equal(violation("BADWORD", 0, 1, config), "Blocked word");
  assert.equal(violation("hello", 6, 1, config), "Mention spam");
  assert.equal(violation("hello", 0, 6, config), "Message spam");
  assert.equal(violation("badword", 6, 6, { ...config, automod: false }), null);
});
test("data persists after restart and is isolated by server", () => {
  const dir = mkdtempSync(join(tmpdir(), "fainted-test-")),
    path = join(dir, "data.sqlite");
  try {
    let store = new Store(path);
    store.configure("a", { autoRole: "123" });
    store.record("a", "user", "mod", "warn", "reason");
    store.close();
    store = new Store(path);
    assert.equal(store.config("a").autoRole, "123");
    assert.equal(store.cases("a", "user").length, 1);
    assert.equal(store.cases("b", "user").length, 0);
    assert.equal(store.config("b").autoRole, undefined);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("XP cooldown and analytics count messages independently", () => {
  const s = new Store(":memory:"),
    now = Date.now();
  s.message("a", "u", true, now);
  s.message("a", "u", true, now + 1000);
  s.message("a", "u", true, now + 61000);
  s.message("a", "other", false, now);
  assert.equal(s.member("a", "u").xp, 30);
  assert.equal(s.analytics("a", 7, now + 61000).messages, 4);
  assert.equal(s.analytics("a", 7, now + 61000).active, 2);
  assert.equal(level(400), 2);
  s.close();
});
test("plan validation rejects duplicate and oversized layouts", () => {
  assert.doesNotThrow(() => validatePlan(templatePlan("coding server")));
  let plan = templatePlan("gaming");
  plan.categories.push(plan.categories[0]);
  assert.throws(() => validatePlan(plan));
  plan = templatePlan("social");
  plan.categories[0].channels[0].type = "delete";
  assert.throws(() => validatePlan(plan));
  plan = templatePlan("social");
  plan.roles = ["@everyone"];
  assert.throws(() => validatePlan(plan));
});
test("all commands have unique names and required options precede optional ones", () => {
  assert.equal(new Set(commands.map((c) => c.name)).size, commands.length);
  const visit = (options) => {
    let optional = false;
    for (const o of options) {
      assert.ok(o.name.length <= 32);
      assert.ok(o.description.length <= 100);
      if (o.type !== 1) {
        if (o.required)
          assert.equal(
            optional,
            false,
            `Required option after optional: ${o.name}`,
          );
        else optional = true;
      }
      if (o.options) visit(o.options);
    }
  };
  for (const c of commands) visit(c.options);
});
test("preflight reports missing configuration without exposing secrets", () => {
  assert.throws(
    () => checkEnv({ DISCORD_TOKEN: "super-secret" }),
    /DISCORD_CLIENT_ID/,
  );
  assert.doesNotThrow(() =>
    checkEnv({
      DISCORD_TOKEN: "super-secret",
      DISCORD_CLIENT_ID: "12345678901234567",
      DISCORD_GUILD_ID: "12345678901234567",
    }),
  );
});
test("per-action locks prevent duplicate mutations and release after failure", async () => {
  const s = new Store(":memory:"),
    bot = new Bot({}, s);
  let release;
  const pending = bot.serial(
    "x",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await assert.rejects(
    bot.serial("x", async () => {}),
    /already running/,
  );
  release();
  await pending;
  await assert.rejects(
    bot.serial("x", async () => {
      throw new Error("fail");
    }),
  );
  assert.equal(await bot.serial("x", async () => 42), 42);
  s.close();
});
test("unauthorized users cannot run moderation even with customized command visibility", async () => {
  const s = new Store(":memory:"),
    bot = new Bot({}, s);
  await assert.rejects(
    bot.command(
      { guild: { id: "g" }, commandName: "ban", options: {} },
      { permissions: new PermissionsBitField() },
      {},
    ),
    /permission/,
  );
  s.close();
});
test("confirmation is bound to requester and expires", async () => {
  const s = new Store(":memory:"),
    bot = new Bot({}, s),
    i = { guildId: "g", guild: {}, customId: "confirm:abc" };
  s.set("g", "pending:abc", {
    actor: "requester",
    expires: Date.now() + 60000,
    kind: "plan",
  });
  await assert.rejects(
    bot.component(i, { id: "other" }, {}),
    /Only the person/,
  );
  s.set("g", "pending:abc", { actor: "requester", expires: 0, kind: "plan" });
  await assert.rejects(bot.component(i, { id: "requester" }, {}), /expired/);
  s.close();
});
test("closed polls reject voting; open polls allow vote replacement", async () => {
  const s = new Store(":memory:"),
    bot = new Bot({}, s);
  const poll = {
    question: "Q",
    answers: ["A", "B"],
    votes: { u: 0 },
    closed: false,
  };
  s.set("g", "poll:msg", poll);
  const i = {
    guildId: "g",
    guild: {},
    customId: "vote:1",
    message: { id: "msg", edit: async () => {} },
    editReply: async () => {},
  };
  await bot.component(i, { id: "u" }, {});
  assert.deepEqual(s.get("g", "poll:msg").votes, { u: 1 });
  s.set("g", "poll:msg", { ...poll, closed: true });
  await assert.rejects(bot.component(i, { id: "u" }, {}), /closed/);
  s.close();
});
test("server builder rejects reusing a public category for private staff channels", async () => {
  const channels = new Collection([
    [
      "c",
      {
        id: "c",
        name: "STAFF LOUNGE",
        type: 4,
        permissionsFor: () => new PermissionsBitField(P.ViewChannel),
      },
    ],
  ]);
  let mutations = 0;
  const guild = {
    id: "g",
    members: {
      fetchMe: async () => ({
        permissions: new PermissionsBitField(P.Administrator),
      }),
    },
    channels: {
      cache: channels,
      fetch: async () => {},
      create: async () => {
        mutations++;
      },
    },
    roles: {
      everyone: {},
      fetch: async () => {},
      cache: new Collection(),
      create: async () => {
        mutations++;
      },
    },
  };
  await assert.rejects(applyPlan(guild, templatePlan("social")), /is public/);
  assert.equal(mutations, 0);
});
test("ticket close cannot be triggered by an unrelated member", async () => {
  const s = new Store(":memory:"),
    bot = new Bot({}, s);
  s.set("g", "ticket:c", { owner: "owner", support: "support", closed: false });
  await assert.rejects(
    bot.closeTicket(
      { guildId: "g", channelId: "c" },
      {
        id: "stranger",
        permissions: new PermissionsBitField(),
        roles: { cache: new Collection() },
      },
    ),
    /Only the ticket owner/,
  );
  s.close();
});
test("server builder can be rerun without duplicating its completed layout", async () => {
  const channels = new Collection(),
    roles = new Collection();
  let sequence = 0;
  const guild = {
    id: "g",
    members: {
      fetchMe: async () => ({
        id: "bot",
        permissions: new PermissionsBitField(P.Administrator),
      }),
    },
    channels: {
      cache: channels,
      fetch: async () => {},
      create: async (spec) => {
        const parent = channels.get(spec.parent);
        const privateArea =
          spec.permissionOverwrites?.some(
            (o) => o.id === "g" && o.deny?.includes(P.ViewChannel),
          ) || parent?.privateArea;
        const ch = {
          ...spec,
          id: String(++sequence),
          parentId: spec.parent,
          privateArea,
          permissionsFor: () =>
            new PermissionsBitField(privateArea ? 0n : P.ViewChannel),
        };
        channels.set(ch.id, ch);
        return ch;
      },
    },
    roles: {
      everyone: {},
      fetch: async () => {},
      cache: roles,
      create: async (spec) => {
        const r = { ...spec, id: String(++sequence) };
        roles.set(r.id, r);
        return r;
      },
    },
  };
  const first = await applyPlan(guild, templatePlan("social"));
  assert.equal(first.created.length, 14);
  assert.ok(first.welcomeChannel);
  assert.ok(first.logChannel);
  const second = await applyPlan(guild, templatePlan("social"));
  assert.equal(second.created.length, 0);
});
test("AutoMod leaves staff messages alone and records allowed activity", async () => {
  const s = new Store(":memory:"),
    bot = new Bot({ user: { id: "bot" } }, s),
    old = process.env.DISCORD_GUILD_ID;
  process.env.DISCORD_GUILD_ID = "g";
  try {
    s.configure("g", { automod: true, blockedWords: ["blocked"] });
    let deleted = false;
    await bot.message({
      guild: { id: "g" },
      guildId: "g",
      author: { id: "staff", bot: false },
      member: {
        id: "staff",
        permissions: new PermissionsBitField(P.ManageMessages),
      },
      content: "blocked",
      mentions: {
        users: new Collection(),
        roles: new Collection(),
        everyone: false,
      },
      delete: async () => {
        deleted = true;
      },
    });
    assert.equal(deleted, false);
    assert.equal(s.analytics("g", 1).messages, 1);
  } finally {
    if (old === undefined) delete process.env.DISCORD_GUILD_ID;
    else process.env.DISCORD_GUILD_ID = old;
    s.close();
  }
});
test("edited violations are deleted and create one moderation case, not XP", async () => {
  const s = new Store(":memory:"),
    bot = new Bot({ user: { id: "bot" } }, s),
    old = process.env.DISCORD_GUILD_ID;
  process.env.DISCORD_GUILD_ID = "g";
  try {
    s.configure("g", { automod: true, blockedWords: ["blocked"] });
    let deleted = false;
    await bot.message(
      {
        guild: { id: "g" },
        guildId: "g",
        author: { id: "u", bot: false },
        member: { id: "u", permissions: new PermissionsBitField() },
        content: "blocked",
        mentions: {
          users: new Collection(),
          roles: new Collection(),
          everyone: false,
        },
        delete: async () => {
          deleted = true;
        },
      },
      true,
    );
    assert.equal(deleted, true);
    assert.equal(s.cases("g", "u").length, 1);
    assert.equal(s.member("g", "u").xp, 0);
  } finally {
    if (old === undefined) delete process.env.DISCORD_GUILD_ID;
    else process.env.DISCORD_GUILD_ID = old;
    s.close();
  }
});
test("ticket opening requires support configuration before creating a channel", async () => {
  const s = new Store(":memory:"),
    bot = new Bot({}, s);
  let touched = false;
  await assert.rejects(
    bot.openTicket(
      {
        guildId: "g",
        guild: {
          id: "g",
          roles: {
            fetch: async () => {
              touched = true;
            },
          },
        },
      },
      { id: "u" },
      {},
    ),
    /support role/,
  );
  assert.equal(touched, false);
  s.close();
});
