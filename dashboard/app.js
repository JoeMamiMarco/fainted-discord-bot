import { conversationMarkup, mountConversations } from "./conversations.js";
const memberMode = document.body.dataset.mode === "member";
let memberSession = null,
  selectedGuild = sessionStorage.getItem("seep-guild") || "",
  guilds = [],
  lastMemberPoll = 0;
window.seepErrors = [];
window.addEventListener("error", (e) => window.seepErrors.push(e.message));
const $ = (s) => document.querySelector(s),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const initial = location.hash.slice(1);
if (/^[a-f0-9]{64}$/.test(initial)) {
  sessionStorage.setItem("seep-session", initial);
  history.replaceState(null, "", "#overview");
}
let token = sessionStorage.getItem("seep-session") || "",
  state = {},
  snapshot = null,
  route = "",
  search = "",
  draft = null,
  toastTimer;
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  spark: "m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z",
  shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z M8 12l3 3 5-6",
  chat: "M4 4h16v12H9l-5 4V4Z M8 8h8 M8 12h5",
  users:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M18 4a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-4",
  gift: "M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8H7a3 3 0 1 1 3-3l2 3Z M12 8h5a3 3 0 1 0-3-3l-2 3Z",
  chart: "M4 20V4 M4 20h17 M8 16v-4 M13 16V7 M18 16v-7",
  ticket: "M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z M15 5v14",
  calendar: "M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16",
  voice:
    "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  box: "m3 7 9-4 9 4-9 4-9-4Z M3 7v10l9 4 9-4V7 M12 11v10",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  file: "M5 3h9l5 5v13H5V3Z M14 3v6h5 M8 13h8 M8 17h6",
};
const icon = (name = "grid") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.grid}"/></svg>`;
const pages = [
  ["overview", "Overview", "grid", "Workspace", "Your server at a glance."],
  [
    "builder",
    "AI Server Builder",
    "spark",
    "Workspace",
    "Describe your community. Preview the layout. Build it.",
  ],
  [
    "ai",
    "AI Assistant",
    "chat",
    "Workspace",
    "Context-aware answers on mentions and replies, powered by local AI.",
  ],
  [
    "moderation",
    "Auto Moderation",
    "shield",
    "Protect",
    "Spam filters, custom words, and local AI moderation.",
  ],
  [
    "security",
    "Security",
    "shield",
    "Protect",
    "Anti-raid lockdown, account-age checks, and anti-nuke protection.",
  ],
  [
    "tickets",
    "Tickets",
    "ticket",
    "Protect",
    "Private support channels, claims, priorities, and transcripts.",
  ],
  [
    "welcome",
    "Welcome & Goodbye",
    "chat",
    "Community",
    "A thoughtful first hello and a proper farewell.",
  ],
  [
    "roles",
    "Roles & Onboarding",
    "users",
    "Community",
    "Self-roles, reaction menus, and button verification.",
  ],
  [
    "leveling",
    "XP & Leveling",
    "chart",
    "Community",
    "Reward messages, voice activity, and milestone levels.",
  ],
  [
    "giveaways",
    "Giveaways",
    "gift",
    "Community",
    "One-click entries and automatic, random winners.",
  ],
  [
    "polls",
    "Polls",
    "chart",
    "Community",
    "Timed polls with anonymous or multiple-choice voting.",
  ],
  [
    "events",
    "Events & Scheduling",
    "calendar",
    "Community",
    "Discord events, RSVPs, and channel reminders.",
  ],
  [
    "voice",
    "Temporary Voice",
    "voice",
    "Community",
    "Create a room by joining. Clean it up when empty.",
  ],
  [
    "analytics",
    "Analytics",
    "chart",
    "Insights",
    "Real member growth, message activity, and channel trends.",
  ],
  [
    "invites",
    "Invites & Sources",
    "users",
    "Insights",
    "Invite attribution, referrals, and reward milestones.",
  ],
  [
    "embeds",
    "Embeds & Webhooks",
    "file",
    "Tools",
    "Design a message and preview it before sending.",
  ],
  [
    "backups",
    "Server Backups",
    "box",
    "Tools",
    "Save layouts and review an additive restore.",
  ],
  [
    "activity",
    "Activity Log",
    "file",
    "Tools",
    "Connection status and operational events.",
  ],
  [
    "settings",
    "Bot Settings",
    "settings",
    "Tools",
    "Connect your Discord application.",
  ],
  [
    "help",
    "Command Guide",
    "file",
    "Tools",
    "Everything you need to use seep in Discord.",
  ],
];
function notify(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
async function api(path, data) {
  let url = "/api/" + path;
  if (
    memberMode &&
    selectedGuild &&
    !["session", "guilds", "logout", "pair", "pair-status"].includes(path)
  ) {
    if (data === undefined)
      url +=
        (url.includes("?") ? "&" : "?") +
        "guildId=" +
        encodeURIComponent(selectedGuild);
    else data = { ...data, guildId: selectedGuild };
  }
  const response = await fetch(url, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(memberMode
        ? { "X-CSRF-Token": memberSession?.csrf || "" }
        : { Authorization: "Bearer " + token }),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
const act = (action, payload) => api("action", { action, payload });
const online = () => ["online", "limited"].includes(state.status);
const cfg = () => snapshot?.config || {};
function navigate(name) {
  location.hash = name;
}
function nav() {
  let group = "";
  $("#navigation").innerHTML = pages
    .filter(([id]) => !memberMode || !["settings", "activity"].includes(id))
    .map(([id, title, i, g]) => {
      const label =
        g !== group ? `<div class="group">${g.toUpperCase()}</div>` : "";
      group = g;
      return (
        label +
        `<a href="#${id}" class="${id === route ? "selected" : ""}" title="${title}">${icon(i)}<span>${title}</span></a>`
      );
    })
    .join("");
}
function heading(title, description, extra = "") {
  return `<div class="page-head"><div><div class="eyebrow">seep / ${esc(route.replaceAll("-", " "))}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${extra}</div>`;
}
function empty(message) {
  return `<div class="empty">${esc(message)}</div>`;
}
function metric(title, value, note) {
  return `<div class="metric"><label>${title}</label><strong>${esc(value ?? "—")}</strong><small>${note}</small></div>`;
}
function metrics() {
  return `<div class="metrics">${metric("Total members", snapshot?.server.members?.toLocaleString(), "Current server membership")}${metric("Messages", snapshot?.analytics.messages?.toLocaleString(), "Last 30 days, while online")}${metric("Active members", snapshot?.analytics.active, "Members who sent messages")}${metric("Bot uptime", state.onlineSince ? formatUptime(Date.now() - state.onlineSince) : "Offline", state.memory ? `Bot memory · ${state.memory} MB` : "Start seep to connect")}</div>`;
}
function formatUptime(ms) {
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function chart(days = 30) {
  const rows = (snapshot?.analytics.daily || []).slice(-days);
  if (!rows.length)
    return '<div class="chart-empty">Activity will appear as members use your server.</div>';
  const max = Math.max(1, ...rows.map((x) => x.messages)),
    coords = rows.map(
      (x, i) =>
        `${(i * 600) / Math.max(1, rows.length - 1)},${130 - (x.messages / max) * 112}`,
    ),
    d = "M" + coords.join(" L");
  return `<svg class="chart" viewBox="0 0 600 140" preserveAspectRatio="none" role="img" aria-label="Daily message activity"><path class="area" d="${d} L600 140 L0 140Z"/><path d="${d}"/></svg><div class="chart-labels"><span>${esc(rows[0].day)}</span><span>${esc(rows.at(-1).day)}</span></div>`;
}
function moduleCards() {
  return pages
    .filter(
      ([id, title]) =>
        !["overview", "activity", "settings", "help"].includes(id) &&
        title.toLowerCase().includes(search.toLowerCase()),
    )
    .map(
      ([id, title, i, , description]) =>
        `<article class="card"><div class="card-top"><span class="iconbox">${icon(i)}</span><span class="tag">INCLUDED</span></div><h3>${title}</h3><p>${description}</p><a href="#${id}">Configure <span>↗</span></a></article>`,
    )
    .join("");
}
function overview() {
  return `<div class="hero"><div><div class="eyebrow">Your community, connected</div><h1>Good things start<br>with a great server.</h1><p>Welcome to ${esc(snapshot?.server.name || "your workspace")}. Build, protect, and grow your community with everything in one place.</p><div class="actions"><button class="primary" data-route="builder">✧ Build with AI</button><button data-route="settings">Bot settings ↗</button></div></div><img src="/seep-logo.png" alt="seep"></div>${metrics()}<div class="section-head"><div><h2>Your modules</h2><p>Every tool included. Make your server your own.</p></div><input class="search" id="module-search" placeholder="Search modules..." aria-label="Search modules" value="${esc(search)}"></div><div class="grid" id="modules">${moduleCards()}</div>`;
}
const text = (key, label, help = "", kind = "text") => ({
  key,
  label,
  help,
  kind,
});
const toggle = (key, label, help = "") => ({
  key,
  label,
  help,
  kind: "toggle",
});
const number = (key, label, min, max, step = 1) => ({
  key,
  label,
  kind: "number",
  min,
  max,
  step,
});
const channel = (key, label, type = 0) => ({
  key,
  label,
  kind: "channel",
  type,
});
const role = (key, label) => ({ key, label, kind: "role" });
const json = (key, label, help) => ({ key, label, kind: "json", help });
const select = (key, label, options) => ({
  key,
  label,
  kind: "select",
  options,
});
function field(f, values) {
  let value = values[f.key];
  if (f.kind === "toggle")
    return `<label class="toggle"><span>${f.label}<small>${f.help || ""}</small></span><input type="checkbox" name="${f.key}" ${value ? "checked" : ""}></label>`;
  let input;
  if (f.kind === "channel" || f.kind === "role") {
    const options =
      f.kind === "channel"
        ? (snapshot?.channels || []).filter((x) => x.type === f.type)
        : snapshot?.roles || [];
    input = `<select name="${f.key}"><option value="">None / choose...</option>${options.map((x) => `<option value="${x.id}" ${x.id === value ? "selected" : ""}>${f.kind === "channel" ? "# " : ""}${esc(x.name)}</option>`).join("")}</select>`;
  } else if (f.kind === "select")
    input = `<select name="${f.key}">${f.options.map(([v, label]) => `<option value="${v}" ${value === v ? "selected" : ""}>${label}</option>`).join("")}</select>`;
  else if (f.kind === "multi")
    input = `<div class="checklist">${(f.source === "roles" ? snapshot?.roles || [] : (snapshot?.channels || []).filter((x) => x.type === 0)).map((x) => `<label><input type="checkbox" name="${f.key}" value="${x.id}" ${(value || []).includes(x.id) ? "checked" : ""}>${esc(x.name)}</label>`).join("") || "Connect the bot to load choices."}</div>`;
  else if (["textarea", "json"].includes(f.kind))
    input = `<textarea name="${f.key}" class="${f.kind === "json" ? "code" : ""}" rows="${f.kind === "json" ? 4 : 5}">${esc(f.kind === "json" ? JSON.stringify(value || [], null, 2) : value || "")}</textarea>`;
  else
    input = `<input name="${f.key}" type="${f.kind}" value="${esc(value ?? "")}" ${f.min !== undefined ? `min="${f.min}" max="${f.max}" step="${f.step}"` : ""} ${f.kind === "password" ? 'autocomplete="new-password" placeholder="Leave blank to keep saved token"' : ""}>`;
  return `<label class="field"><span>${f.label}</span>${input}${f.help ? `<small>${f.help}</small>` : ""}</label>`;
}
const forms = new Map();
function form(
  id,
  title,
  description,
  fields,
  values,
  submit,
  button = "Save changes",
) {
  forms.set(id, { fields, submit });
  return `<form class="panel" id="${id}"><h2>${title}</h2><p>${description}</p>${fields.map((f) => field(f, values)).join("")}<div class="actions"><button class="primary" type="submit">${button}</button><span class="hint">${id === "login" ? "Saved only on this PC" : "Applied to your configured server"}</span></div><div class="form-result" aria-live="polite"></div></form>`;
}
function collect(formEl, fields) {
  const data = {};
  for (const f of fields) {
    const el = formEl.elements.namedItem(f.key);
    if (f.kind === "toggle") data[f.key] = el.checked;
    else if (f.kind === "multi")
      data[f.key] = [
        ...formEl.querySelectorAll(`[name="${f.key}"]:checked`),
      ].map((x) => x.value);
    else if (f.kind === "number") data[f.key] = Number(el.value);
    else if (f.kind === "json") data[f.key] = JSON.parse(el.value || "[]");
    else
      data[f.key] =
        el.value || (f.kind === "channel" || f.kind === "role" ? null : "");
  }
  return data;
}
function settingForm(id, title, description, fields) {
  return form(id, title, description, fields, cfg(), async (data) => {
    await act("settings", data);
    if (snapshot) snapshot.config = { ...cfg(), ...data };
    return { message: "Settings saved." };
  });
}
function table(headers, rows) {
  return rows.length
    ? `<div class="table-wrap"><table><thead><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : empty("Nothing here yet. Create your first one above.");
}
function discordPreview(data = {}) {
  return `<div class="preview-label">Discord preview</div><div class="discord"><img class="avatar" src="/seep-logo.png" alt="seep"><div class="discord-body"><div class="discord-name">${esc(data.username || "seep")}<b>APP</b><small>Today at 12:00</small></div><div class="embed"><div class="embed-author">SEEP</div><h3>${esc(data.title || "Welcome to your community")}</h3><div class="embed-description">${esc(data.description || "A little space for something great. Read the rules, pick your roles, and say hello.")}</div>${data.image && /^https:\/\//.test(data.image) ? `<img src="${esc(data.image)}" alt="Embed image">` : ""}<small>${esc(data.footer || "seep • Your community, connected")}</small></div></div></div>`;
}
function builder() {
  return `<div class="builder-workspace">${conversationMarkup()}<section class="panel plan-panel"><h2>Server preview</h2><p>Review your layout. Building adds missing channels and ordinary roles.</p><div id="draft">${empty("Your draft will appear here.")}</div></section></div>`;
}
function renderDraft() {
  const target = $("#draft");
  if (!target) return;
  if (!draft) {
    target.innerHTML = empty("Your draft will appear here.");
    return;
  }
  target.innerHTML = `<div class="chips">${draft.plan.roles.map((r) => `<span class="chip">◌ ${esc(r)}</span>`).join("")}</div>${draft.plan.categories.map((c) => `<div class="channel-preview"><h3>${c.private ? "◈ Private · " : ""}${esc(c.name)}</h3>${c.channels.map((ch) => `<div>${ch.type === "voice" ? "◖" : "#"} ${esc(ch.name)}</div>`).join("")}</div>`).join("")}<button class="primary" id="build-plan">Build this layout ↗</button>`;
  $("#build-plan").onclick = async () => {
    if (
      await confirmAction(
        "Build this layout?",
        `This adds ${draft.plan.categories.reduce((n, c) => n + c.channels.length, 0)} channels and up to ${draft.plan.roles.length} ordinary roles in ${snapshot?.server.name || "your server"}. Existing channels are retained.`,
      )
    ) {
      const button = $("#build-plan");
      button.disabled = true;
      try {
        const result = await act("build", { token: draft.token });
        draft = null;
        target.innerHTML = `<h3>Build complete</h3><p>${result.created.length} new items created.</p>`;
        notify("Your server layout is ready.");
        await refreshSnapshot();
      } catch (e) {
        notify(e.message);
        button.disabled = false;
      }
    }
  };
}
function ai() {
  return (
    conversationMarkup() +
    settingForm(
      "ai-settings",
      "Replies in Discord",
      "Mention seep, or reply to a seep message to continue the conversation.",
      [
        toggle(
          "aiMentions",
          "Reply to mentions and replies",
          "Every AI answer includes a reply-to-continue hint.",
        ),
        select("aiPersonality", "Personality", [["friendly","Friendly"],["professional","Professional"],["witty","Witty"],["nerdy","Nerdy"],["sarcastic","Gently sarcastic"]]),
        select("aiMood", "Mood", [["cheerful","Cheerful"],["calm","Calm"],["energetic","Energetic"],["serious","Serious"]]),
        select("aiHumor", "Humor", [["off","Off"],["light","Light humor"],["playful","Playful"]]),
        select("aiEmoji", "Emoji usage", [["none","None"],["occasional","Occasional"],["expressive","Expressive"]]),
        select("aiLength", "Reply length", [["brief","Brief"],["balanced","Balanced"],["detailed","Detailed"]]),
        json(
          "autoResponses",
          "Automatic responses",
          "Trigger and reply pairs, without AI.",
        ),
      ],
    )
  );
}
function moderation() {
  return `<div class="columns"><div>${settingForm("automod", "Keep conversations healthy", "Filters apply to ordinary members; moderators are exempt.", [toggle("automod", "Enable AutoMod"), toggle("blockInvites", "Block Discord invite links"), number("mentionLimit", "Mention threshold", 2, 30), number("spamLimit", "Messages in 8 seconds", 3, 30), json("blockedWords", "Blocked words", 'A JSON list, such as ["blocked phrase"].')])}</div><div>${settingForm("ai-mod", "Local AI moderation", "Checks selected channels for targeted harassment, threats, and scams. Flagged messages are deleted and logged; it does not issue AI bans.", [toggle("aiModeration", "Enable AI content filtering", "Checks at most one message every 10 seconds to limit CPU use."), { key: "aiChannels", label: "Channels to monitor", kind: "multi" }])}<div class="panel"><h3>Manual moderation</h3><p>Use /warn, /timeout, /kick, /ban, /purge, /slowmode, /lock and /unlock in Discord. Every command checks staff permissions and role hierarchy.</p><button data-route="help">View commands ↗</button></div></div></div>`;
}
function security() {
  return `<div class="columns"><div>${settingForm("raid", "Raid & destructive action protection", "Automatic controls are off until you enable them.", [toggle("raidProtection", "Anti-raid lockdown"), number("raidThreshold", "Joins to trigger lockdown", 3, 50), number("raidWindow", "Join window in seconds", 5, 120), number("lockdownMinutes", "Restore channel permissions after (minutes)", 1, 30), toggle("antiNuke", "Anti-nuke protection", "Remove dangerous roles from actors below the bot after repeated destructive audit events."), number("nukeThreshold", "Destructive events in 10 seconds", 3, 20)])}<div class="panel"><div class="actions"><button id="lockdown">Lock public text channels</button><button id="unlock">Restore permissions</button></div></div></div><div>${settingForm(
    "alt",
    "Account-age gate",
    "Identify young accounts and choose what happens.",
    [
      toggle("altDetection", "Detect young accounts"),
      number("minAccountDays", "Minimum account age (days)", 1, 365),
      select("altAction", "Action", [
        ["log", "Log for staff review"],
        ["kick", "Kick eligible new members"],
      ]),
    ],
  )}${settingForm("inactive", "Inactive member cleanup", "Once daily, removes up to 10 eligible members with only the default role. Requires enough recorded observation history.", [toggle("inactiveAuto", "Enable scheduled inactive kicks"), number("inactiveDays", "Inactive for at least (days)", 7, 365)])}</div></div>`;
}
function welcome() {
  const fields = (kind) => [
    channel(kind + "Channel", "Delivery channel"),
    text(kind + "Title", "Embed title"),
    text(
      kind,
      "Message",
      "Placeholders: {user}, {name}, {server}, {count}.",
      "textarea",
    ),
    text(kind + "Image", "Image URL (optional)", "Public HTTPS image."),
    toggle(
      kind + "DM",
      "Also send a direct message",
      "Discord privacy settings may prevent delivery.",
    ),
  ];
  return `<div class="columns"><div>${settingForm("welcome-settings", "Welcome messages", "Make newcomers feel at home.", [...fields("welcome"), role("autoRole", "Automatically assign role")])}${settingForm("goodbye-settings", "Goodbye messages", "A farewell in your selected channel, DM, or both.", fields("goodbye"))}</div><div class="panel" id="welcome-preview">${discordPreview({ title: cfg().welcomeTitle, description: cfg().welcome, image: cfg().welcomeImage })}</div></div>`;
}
function roles() {
  return `<div class="columns"><div>${form(
    "role-menu",
    "Publish a role menu",
    "Normal, non-staff roles only. Members use buttons or reactions.",
    [
      channel("channel", "Channel"),
      select("kind", "Panel type", [
        ["roles", "Self-role menu"],
        ["onboarding", "Rules & verification"],
      ]),
      text("description", "Message / rules", "", "textarea"),
      {
        key: "roles",
        label: "Roles (up to five)",
        kind: "multi",
        source: "roles",
      },
    ],
    { description: "Read our rules, then choose a role to get started." },
    (p) =>
      act("panel", {
        ...p,
        roles: p.roles.slice(0, 5).map((id, i) => ({
          id,
          name: snapshot.roles.find((r) => r.id === id)?.name,
          emoji: ["◻️", "◼️", "⚪", "⚫", "▫️"][i],
        })),
      }),
    "Publish panel",
  )}</div><div class="panel">${discordPreview({ title: "Choose your roles", description: "Read the rules and find your people.\n\n◻ Gamer\n◼ Creator\n◌ Community" })}<div class="actions"><button disabled>Get role</button><button disabled>I agree · Verify</button></div><p>Preview only. The real buttons are published to your selected Discord channel.</p></div></div>`;
}
function leveling() {
  return `<div class="columns"><div>${settingForm("xp", "Make activity count", "Members gain message XP and optional voice XP. Rewards use ordinary roles below seep.", [toggle("leveling", "Message XP"), toggle("voiceXP", "Voice activity XP", "Requires two human members in a voice channel; deafened members are excluded."), number("xpMultiplier", "XP multiplier", 0.1, 5, 0.1), number("xpDecay", "Daily XP decay (%)", 0, 100), json("levelRewards", "Level role rewards", 'Example: [{"at":5,"role":"ROLE_ID"}].')])}</div><div class="panel"><h2>Leaderboard</h2><p>Real XP earned in this server.</p>${table(
    ["Rank", "Member", "Level", "XP"],
    (snapshot?.leaderboard || []).map((m, i) => [
      i + 1,
      esc(m.user),
      Math.floor(Math.sqrt(m.xp / 100)),
      m.xp.toLocaleString(),
    ]),
  )}<div class="instruction">Use <code>/rank</code> or <code>/leaderboard</code> in Discord.</div></div></div>`;
}
function giveaways() {
  return (
    form(
      "giveaway",
      "Something worth celebrating",
      "Winners are selected automatically using a cryptographically secure random draw.",
      [
        channel("channel", "Channel"),
        text("prize", "Prize"),
        number("minutes", "Duration in minutes", 1, 525600),
        number("winners", "Number of winners", 1, 20),
        role("role", "Required role (optional)"),
        number("minAccountDays", "Minimum account age in days", 0, 365),
      ],
      { minutes: 60, winners: 1, minAccountDays: 0 },
      (p) => act("giveaway", p),
      "Create giveaway",
    ) +
    `<section class="panel"><h2>Your giveaways</h2>${table(
      ["Prize", "Entries", "Status", "Actions"],
      (snapshot?.giveaways || []).map((x) => [
        esc(x.prize),
        x.entryCount,
        x.closed ? "Ended" : new Date(x.ends).toLocaleString(),
        `<button data-giveaway="${x.id}" data-action="${x.closed ? "giveaway-reroll" : "giveaway-end"}">${x.closed ? "Reroll" : "End now"}</button>`,
      ]),
    )}</section>`
  );
}
function polls() {
  return (
    form(
      "poll",
      "Let everyone have a say",
      "Choose a deadline and let seep close voting automatically.",
      [
        channel("channel", "Channel"),
        text("question", "Question"),
        text("answers", "Choices", "Separate 2–5 choices with |."),
        number("minutes", "Duration in minutes", 1, 525600),
        toggle("anonymous", "Anonymous votes"),
        toggle("multiple", "Allow multiple choices"),
      ],
      { minutes: 60, anonymous: true, multiple: false },
      (p) => act("poll", p),
      "Publish poll",
    ) +
    `<section class="panel"><h2>Poll history</h2>${table(
      ["Question", "Voters", "Status"],
      (snapshot?.polls || []).map((x) => [
        esc(x.question),
        x.votes,
        x.closed ? "Closed" : "Open",
      ]),
    )}</section>`
  );
}
function events() {
  return (
    form(
      "event",
      "Bring your community together",
      "Creates a Discord scheduled event and an RSVP message. A channel reminder is sent ten minutes before start.",
      [
        channel("channel", "Announcement channel"),
        text("title", "Event title"),
        text("description", "Description", "", "textarea"),
        text("starts", "Start time (your local time)", "", "datetime-local"),
        number("hours", "Duration in hours", 1, 168),
        text("location", "Location / voice channel"),
      ],
      { hours: 1 },
      (p) => act("event", { ...p, starts: new Date(p.starts).toISOString() }),
      "Create event",
    ) +
    `<section class="panel"><h2>Upcoming & past events</h2>${table(
      ["Event", "Starts", "RSVPs"],
      (snapshot?.events || []).map((x) => [
        esc(x.title),
        esc(new Date(x.starts).toLocaleString()),
        x.rsvpCount,
      ]),
    )}</section>`
  );
}
function voice() {
  return settingForm(
    "voice",
    "A room of your own",
    "Join the lobby to create a personal voice channel. Empty rooms are removed automatically.",
    [
      channel("joinToCreate", "Join-to-create lobby", 2),
      channel("voiceCategory", "Category for new rooms", 4),
      number("voiceLimit", "User limit per room (0 means no limit)", 0, 99),
    ],
  );
}
function tickets() {
  return `<div class="columns"><div>${settingForm("support", "Support team", "Select the staff role allowed to view, claim, and export tickets.", [role("supportRole", "Support role")])}${form("ticket-panel", "Open the door to support", "Publish a one-click ticket panel in a channel.", [channel("channel", "Panel channel")], {}, (p) => act("panel", { ...p, kind: "ticket" }), "Publish ticket panel")}</div><div class="panel">${discordPreview({ title: "How can we help?", description: "Open a private ticket to reach our support team.\nYour conversation stays between you and staff." })}<button disabled>Open ticket</button></div></div><section class="panel"><h2>Support queue</h2>${table(
    ["Ticket", "Owner", "Status", "Priority", "Transcript"],
    (snapshot?.tickets || []).map((x) => [
      esc(x.channel),
      esc(x.owner),
      x.closed ? "Closed" : x.claimedBy ? "Claimed" : "Open",
      `<select data-priority="${x.channel}">${["low", "normal", "high", "urgent"].map((v) => `<option ${v === (x.priority || "normal") ? "selected" : ""}>${v}</option>`).join("")}</select>`,
      `<button data-transcript="${x.channel}">Download</button>`,
    ]),
  )}<p>Transcripts include the most recent 100 messages and attachment links.</p></section>`;
}
function analytics() {
  return `${metrics()}<section class="panel"><div class="section-head"><div><h2>Message activity</h2><p>Observed daily activity, recorded while seep is online.</p></div><select id="chart-days" style="width:90px"><option>30</option><option>7</option><option>90</option></select></div><div id="chart">${chart()}</div></section><div class="columns"><section class="panel"><h2>Top channels</h2>${table(
    ["Channel", "Messages"],
    (snapshot?.analytics.channels || []).map((c) => [
      "# " + esc(c.name),
      c.messages,
    ]),
  )}</section><section class="panel"><h2>Moderation actions</h2>${table(
    ["Action", "Count"],
    (snapshot?.analytics.cases || []).map((c) => [esc(c.action), c.count]),
  )}<button id="analyze" class="primary">✧ Explain my analytics</button><div id="analysis" class="form-result"></div></section></div>`;
}
function invites() {
  return `<div class="columns"><div class="panel"><h2>Invite attribution</h2><p>Only uniquely attributable invite changes are credited. Ambiguous or offline joins remain unknown.</p>${table(
    ["Inviter / source", "Joins"],
    (snapshot?.sources || []).map((x) => [
      esc(x.inviter || "Unknown / unattributed"),
      x.count,
    ]),
  )}</div><div>${settingForm("invite-rewards", "Reward your community builders", "Assign normal roles when an inviter reaches a milestone.", [json("inviteRewards", "Invite role rewards", 'Example: [{"at":10,"role":"ROLE_ID"}].')])}</div></div>`;
}
function embeds() {
  return `<div class="columns"><div>${form(
    "embed",
    "A message worth reading",
    "Design your embed, then send it as seep or an owned webhook.",
    [
      channel("channel", "Destination channel"),
      text("title", "Title"),
      text("description", "Message", "", "textarea"),
      text("footer", "Footer"),
      text("image", "Image URL (optional)"),
      text("thumbnail", "Thumbnail URL (optional)"),
      toggle("webhook", "Send through webhook"),
      text("username", "Webhook display name"),
      text("avatar", "Webhook avatar URL (optional)"),
    ],
    {
      title: "Welcome to your community",
      description: "Read the rules, pick your roles, and say hello.",
      footer: "seep • Your community, connected",
      username: "seep",
    },
    async (p) => {
      if (
        !(await confirmAction(
          "Send this embed?",
          `Your message will be published to #${snapshot?.channels.find((c) => c.id === p.channel)?.name || "the selected channel"}.`,
        ))
      )
        return { message: "Cancelled." };
      return act("embed", { ...p, color: "#ffffff" });
    },
    "Send to Discord ↗",
  )}</div><div class="panel" id="embed-preview">${discordPreview()}</div></div>`;
}
function backups() {
  return `${settingForm("backup-schedule", "Keep a copy of your layout", "Backups contain channel/role layout and settings. Restore previews add missing items; they do not delete existing channels or recover old messages.", [toggle("autoBackups", "Create a daily layout backup")])}<div class="panel"><div class="section-head"><div><h2>Your backups</h2><p>Stored locally with your bot data.</p></div><button id="backup-now" class="primary">Create backup</button></div>${table(
    ["Server", "Created", "Actions"],
    (snapshot?.backups || []).map((x) => [
      esc(x.name),
      esc(new Date(x.time).toLocaleString()),
      `<button data-restore="${x.id}">Preview restore</button>`,
    ]),
  )}</div>`;
}
function settings() {
  return `${form("presence", "Discord Rich Presence", "Show seep artwork and dashboard activity on your Discord profile while this app is open. Discord desktop must be running.", [toggle("enabled", "Show seep on my Discord profile")], { enabled: state.presenceEnabled !== false }, (p) => api("presence", p), "Save presence")}<p class="instruction">${esc(state.presence || "Waiting for Discord desktop")}</p>${form("oauth", "Discord login for server managers", "Enter the OAuth2 client secret from Developer Portal → OAuth2. Leave it blank to keep the saved secret. Register the redirect URL shown below.", [text("secret", "OAuth2 client secret", "", "password"), text("origin", "Member dashboard origin")], { origin: "http://127.0.0.1:11438" }, (p) => api("oauth", p), "Save Discord login")}<div class="instruction">Redirect URL: <code id="oauth-redirect">http://127.0.0.1:11438/auth/callback</code><br><span id="oauth-status"></span><br>Open <b>seep member dashboard.exe</b> for the version without bot controls.</div><div class="columns"><div>${form("login", "Connect your Discord application", "Keep your token private. Leave the token field blank to keep the saved value.", [text("token", "Bot token", "", "password"), text("clientId", "Application ID"), text("guildId", "Server ID")], state.credentials || {}, (p) => api("credentials", p), "Save connection")}<div class="panel"><h2>Local AI</h2><p>Qwen3-VL 2B Instruct · runs on your CPU. The one-time model download is approximately 1.9 GB.</p><div class="actions"><button data-control="setup">Install / repair AI</button><button data-control="test-ai">Test local AI</button><button data-control="register">Sync commands</button></div></div></div><div class="panel"><h2>First-time setup</h2><p>Enable Server Members Intent and Message Content Intent in Developer Portal → Bot. Invite seep with the bot and applications.commands scopes.</p><p>Move seep's role above the roles it should manage. The bot needs the permissions for each feature you enable, including Manage Events for scheduled events and Manage Webhooks for webhook messages.</p><a class="primary" href="https://discord.com/developers/applications/${esc(state.credentials?.clientId || "")}" target="_blank" rel="noreferrer">Open Developer Portal ↗</a><div class="instruction">Use <b>Stop</b> to disconnect the bot, or close this desktop window to shut down seep and local AI.</div></div></div>`;
}
function help() {
  return `<div class="columns"><section class="panel"><h2>Moderation</h2><p>/warn · /history · /timeout · /untimeout · /kick · /ban · /unban · /purge · /slowmode · /lock · /unlock · /inactive</p><h2>Community</h2><p>/rank · /leaderboard · /invites · /invite-leaderboard · /analytics · /poll · /ticket · /role-panel · /onboarding</p><h2>Server design</h2><p><code>/server plan</code> with <code>ai:true</code> creates a local AI draft. Attach a screenshot to use it as a visual layout reference. Review the preview before Build.</p><h2>Talk to seep</h2><p><code>@seep your question</code> → seep replies in the same channel. No API key needed.</p></section><section class="panel"><h2>Your bot, your machine</h2><p>All software features are included. Your computer must be on and connected for the bot to respond. Model quality and speed depend on your hardware; local AI can make mistakes.</p><p>Security features are opt-in and can only act within Discord's permissions and role hierarchy. AI moderation samples selected channels to stay light; it is not an exhaustive safety filter.</p><p>There is no paid support tier or external support team bundled with seep.</p></section></div>`;
}
function activity() {
  return `<section class="panel"><div class="section-head"><h2>Activity log</h2><button id="download-log">Download log</button></div><div class="activity" id="activity-lines">${logLines()}</div></section>`;
}
function logLines() {
  return (
    (state.history || [])
      .map(
        (x) =>
          `<time>${new Date(x.time).toLocaleTimeString()}</time>  ${esc(x.message)}`,
      )
      .join("\n") || "Ready. Start seep to see activity."
  );
}
const views = {
  overview,
  builder,
  ai,
  moderation,
  security,
  welcome,
  roles,
  leveling,
  giveaways,
  polls,
  events,
  voice,
  tickets,
  analytics,
  invites,
  embeds,
  backups,
  settings,
  help,
  activity,
};
async function confirmAction(title, message) {
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = message;
  $("#confirm").showModal();
  return new Promise((resolve) => {
    const done = (value) => {
      $("#confirm").close();
      resolve(value);
    };
    $("#accept-confirm").onclick = () => done(true);
    $("#cancel-confirm").onclick = () => done(false);
    $("#confirm").oncancel = (e) => {
      e.preventDefault();
      done(false);
    };
  });
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refreshSnapshot() {
  if (!online()) return;
  snapshot = await act("snapshot");
}
function render() {
  route = location.hash.slice(1) || "overview";
  if (!views[route] || (memberMode && ["settings", "activity"].includes(route)))
    route = "overview";
  forms.clear();
  nav();
  const page = pages.find((x) => x[0] === route);
  $("#crumb").textContent = page[1];
  $("#main").innerHTML =
    (route === "overview" ? "" : heading(page[1], page[4])) + views[route]();
  for (const [id, definition] of forms) {
    const element = document.getElementById(id);
    element.onsubmit = async (e) => {
      e.preventDefault();
      const button = element.querySelector("button[type=submit]"),
        result = element.querySelector(".form-result");
      button.disabled = true;
      result.textContent = "Working...";
      try {
        const response = await definition.submit(
          collect(element, definition.fields),
        );
        result.textContent =
          response.reply ||
          response.message ||
          (response.url
            ? "Published: " + response.url
            : response.saved
              ? "Connection saved. Press Start bot."
              : "Done.");
        notify("Done.");
        if (
          ["giveaway", "poll", "event", "ticket-panel", "role-menu"].includes(
            id,
          )
        ) {
          await refreshSnapshot();
          render();
        }
      } catch (error) {
        result.textContent = error.message;
        notify(error.message);
      } finally {
        button.disabled = false;
      }
    };
  }
  document
    .querySelectorAll("[data-route]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.route)));
  document
    .querySelectorAll("[data-control]")
    .forEach((b) => (b.onclick = () => control(b.dataset.control)));
  if ($("#module-search"))
    $("#module-search").oninput = (e) => {
      search = e.target.value;
      $("#modules").innerHTML = moduleCards();
    };
  if (route === "builder" || route === "ai") {
    if (route === "builder") renderDraft();
    void mountConversations({
      api,
      kind: route === "builder" ? "plan" : "chat",
      scope:
        (memberSession?.user.id || "owner") +
        ":" +
        (selectedGuild || snapshot?.server.id || "local"),
      notify,
      onDraft: (x) => {
        draft = x;
        renderDraft();
      },
    });
  }
  if (route === "settings" && !memberMode)
    api("oauth")
      .then((x) => {
        $("#oauth [name=origin]").value = x.origin;
        $("#oauth-redirect").textContent = x.redirect;
        $("#oauth-status").textContent = x.configured
          ? "Discord login is configured."
          : "Discord login needs your client secret.";
      })
      .catch((e) => notify(e.message));
  if (route === "embeds")
    $("#embed").oninput = () => {
      $("#embed-preview").innerHTML = discordPreview(
        collect($("#embed"), forms.get("embed").fields),
      );
    };
  if (route === "welcome")
    $("#welcome-settings").oninput = () => {
      const x = collect(
        $("#welcome-settings"),
        forms.get("welcome-settings").fields,
      );
      $("#welcome-preview").innerHTML = discordPreview({
        title: x.welcomeTitle,
        description: x.welcome,
        image: x.welcomeImage,
      });
    };
  if ($("#chart-days"))
    $("#chart-days").onchange = (e) =>
      ($("#chart").innerHTML = chart(Number(e.target.value)));
  if ($("#analyze"))
    $("#analyze").onclick = async (e) => {
      e.target.disabled = true;
      try {
        $("#analysis").textContent = "Analyzing locally...";
        $("#analysis").textContent = (await act("analyze")).reply;
      } catch (error) {
        $("#analysis").textContent = error.message;
      } finally {
        e.target.disabled = false;
      }
    };
  if ($("#backup-now"))
    $("#backup-now").onclick = async (e) => {
      e.target.disabled = true;
      try {
        const x = await act("backup");
        download("seep-backup-" + x.id + ".json", JSON.stringify(x, null, 2));
        await refreshSnapshot();
        render();
      } catch (error) {
        notify(error.message);
        e.target.disabled = false;
      }
    };
  document.querySelectorAll("[data-restore]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          draft = await act("restore-preview", { id: b.dataset.restore });
          navigate("builder");
        } catch (e) {
          notify(e.message);
        }
      }),
  );
  document.querySelectorAll("[data-giveaway]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          !(await confirmAction(
            "Select giveaway winners?",
            b.dataset.action === "giveaway-reroll"
              ? "New winners will be chosen from the remaining eligible entries."
              : "This ends the giveaway and publishes the winners.",
          ))
        )
          return;
        try {
          await act(b.dataset.action, { id: b.dataset.giveaway });
          await refreshSnapshot();
          render();
        } catch (e) {
          notify(e.message);
        }
      }),
  );
  document.querySelectorAll("[data-transcript]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          const t = await act("ticket-transcript", {
            channel: b.dataset.transcript,
          });
          download(t.filename, t.text);
        } catch (e) {
          notify(e.message);
        }
      }),
  );
  document.querySelectorAll("[data-priority]").forEach(
    (b) =>
      (b.onchange = () =>
        act("ticket-priority", {
          channel: b.dataset.priority,
          priority: b.value,
        })
          .then(() => notify("Priority updated."))
          .catch((e) => notify(e.message))),
  );
  if ($("#lockdown"))
    $("#lockdown").onclick = async () => {
      if (
        await confirmAction(
          "Lock public channels?",
          `Public text channels will stop accepting messages for ${cfg().lockdownMinutes || 5} minutes.`,
        )
      )
        act("lockdown")
          .then((x) => notify(x.message))
          .catch((e) => notify(e.message));
    };
  if ($("#unlock"))
    $("#unlock").onclick = () =>
      act("unlock")
        .then((x) => notify(x.message))
        .catch((e) => notify(e.message));
  if ($("#download-log"))
    $("#download-log").onclick = () =>
      download(
        "seep-activity.txt",
        (state.history || [])
          .map((x) => new Date(x.time).toISOString() + " " + x.message)
          .join("\n"),
      );
}
async function control(action) {
  try {
    if (
      action === "shutdown" &&
      !(await confirmAction(
        "Shut down seep dashboard?",
        "The bot and local AI will stop. Open seep dashboard.exe to return.",
      ))
    )
      return;
    await api("control", { action });
    if (action === "shutdown") {
      $("#notice").hidden = false;
      $("#notice").textContent = "seep is shut down. You can close this tab.";
    } else await poll();
  } catch (e) {
    notify(e.message);
  }
}
let polling = false,
  connectionLost = false;
async function poll() {
  if (memberMode && (!selectedGuild || !memberSession?.user)) return;
  if (memberMode && Date.now() - lastMemberPoll < 30000) return;
  lastMemberPoll = Date.now();
  if (polling) return;
  polling = true;
  try {
    const previous = snapshot?.server?.id;
    state = await api("state");
    if (state.snapshot) snapshot = state.snapshot;
    $("#connection").textContent =
      state.status === "limited"
        ? "Online · limited"
        : state.status || "Offline";
    $("#connection").classList.toggle("online", online());
    if (!memberMode) {
      $("#start").disabled = !!state.active;
      $("#stop").disabled = !state.active || state.status === "stopping";
      $("#restart").disabled = !online();
    }
    $("#server-name").textContent = snapshot?.server.name || "Your server";
    const message = state.error || state.warning;
    $("#notice").hidden = !message;
    $("#notice").textContent = message || "";
    if (!route || previous !== snapshot?.server.id) render();
    if (route === "activity" && $("#activity-lines"))
      $("#activity-lines").innerHTML = logLines();
    connectionLost = false;
  } catch (e) {
    $("#notice").hidden = false;
    $("#notice").textContent = token
      ? "Dashboard disconnected. Open seep dashboard.exe to reconnect."
      : e.message;
    if (!route) render();
    if (!connectionLost && token) notify(e.message);
    connectionLost = true;
  } finally {
    polling = false;
  }
}
async function memberLogin() {
  memberSession = await api("session");
  if (!memberSession.user) {
    $("#navigation").innerHTML = "";
    $("#connection").textContent = "Signed out";
    $("#main").innerHTML =
      '<div class="login-card"><img src="/seep-logo.png" alt="seep"><div class="eyebrow">seep dashboard</div><h1>Your community. Your space.</h1><p>Sign in with Discord to manage your servers and continue your saved AI chats.</p><button class="primary" id="discord-login">Continue with Discord ↗</button><p id="login-status">' +
      (memberSession.configured
        ? "Only servers you own or can manage appear here."
        : "The owner needs to configure Discord login in their dashboard.") +
      "</p></div>";
    $("#discord-login").onclick = async () => {
      try {
        if (window.chrome?.webview) {
          const p = await api("pair", {});
          window.chrome.webview.postMessage(p.url);
          $("#login-status").textContent =
            "Finish signing in in your browser, then return here.";
          const timer = setInterval(async () => {
            try {
              const x = await api("pair-status", { code: p.code });
              if (x.ready) {
                clearInterval(timer);
                await memberLogin();
              }
            } catch (e) {
              clearInterval(timer);
              $("#login-status").textContent = e.message;
            }
          }, 2000);
        } else location.href = "/auth/login";
      } catch (e) {
        $("#login-status").textContent = e.message;
      }
    };
    return;
  }
  $("#connection").textContent = memberSession.user.username;
  try {
    guilds = await api("guilds");
  } catch (e) {
    $("#main").innerHTML =
      heading("Waiting for seep", e.message) +
      '<button id="retry-member">Try again</button>';
    $("#retry-member").onclick = () => memberLogin();
    return;
  }
  const switcher = $(".server-switch");
  switcher.innerHTML =
    '<label class="server-picker">Your servers<select id="guild-picker"><option value="">Choose a server</option>' +
    guilds
      .map(
        (g) =>
          '<option value="' +
          g.id +
          '">' +
          esc(g.name) +
          (g.installed ? "" : " · Invite seep") +
          "</option>",
      )
      .join("") +
    '</select></label><strong id="server-name" hidden></strong>';
  if (!guilds.some((g) => g.id === selectedGuild)) selectedGuild = "";
  $("#guild-picker").value = selectedGuild;
  const choose = async () => {
    selectedGuild = $("#guild-picker").value;
    sessionStorage.setItem("seep-guild", selectedGuild);
    snapshot = null;
    route = "";
    draft = null;
    lastMemberPoll = 0;
    const g = guilds.find((x) => x.id === selectedGuild);
    if (!g) {
      $("#main").innerHTML = heading(
        "Choose your server",
        "Select a server from the sidebar to start.",
      );
      return;
    }
    if (!g.installed) {
      $("#main").innerHTML =
        heading(
          "Invite seep to " + g.name,
          "Add seep first, then grant the permissions needed for your features.",
        ) +
        '<a class="primary" href="' +
        esc(g.invite) +
        '" target="_blank" rel="noreferrer">Invite seep ↗</a><button id="refresh-guilds">Refresh servers</button>';
      $("#refresh-guilds").onclick = () => memberLogin();
      return;
    }
    await poll();
  };
  $("#guild-picker").onchange = choose;
  await choose();
}
if (memberMode) {
  $("#exit").onclick = async () => {
    try {
      await api("logout", {});
      selectedGuild = "";
      snapshot = null;
      route = "";
      await memberLogin();
    } catch (e) {
      notify(e.message);
    }
  };
  await memberLogin();
} else {
  $("#start").onclick = () => control("start");
  $("#stop").onclick = () => control("stop");
  $("#restart").onclick = () => control("restart");
  $("#exit").onclick = () => control("shutdown");
  await poll();
}
window.addEventListener("hashchange", () => {
  if (
    !memberMode ||
    (memberSession?.user &&
      guilds.find((g) => g.id === selectedGuild)?.installed)
  )
    render();
});
setInterval(poll, memberMode ? 30000 : 2500);
