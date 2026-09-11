const main = document.querySelector("main");
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const notify = (text) => {
  document.querySelector("#notice").textContent = text;
  setTimeout(() => (document.querySelector("#notice").textContent = ""), 6000);
};
let data, selected;
const invite =
  "https://discord.com/oauth2/authorize?client_id=1547337805275865239&scope=bot%20applications.commands&permissions=0";
const title = (label, heading, body) =>
  `<section class="page-title"><span class="eyebrow">${label}</span><h1>${heading}</h1><p>${body}</p></section>`;
const featureCards = [
  [
    "01",
    "A calmer community",
    "Moderation, welcome messages, verification, reaction roles, tickets and activity insights. Configure permissions and opt-in automation on your host.",
  ],
  [
    "02",
    "An extra pair of eyes",
    "Generate, explain, debug and review code with local AI. Private, expiring context. Code is never executed on the bot server.",
  ],
  [
    "03",
    "Structure with intention",
    "Start from a template, describe a community, or reference a screenshot. Review a draft before creating channels and ordinary roles.",
  ],
  [
    "04",
    "A personality that fits",
    "Friendly, professional, witty or quietly nerdy. Set tone, humor, emoji frequency and response length per server.",
  ],
  [
    "05",
    "Your data, your host",
    "SQLite storage, private templates, server-scoped settings and Discord permission checks. No invented analytics.",
  ],
  [
    "06",
    "Built to be understood",
    "Open source, documented limits and readable build reports. Partial builds retain their progress for reviewed retries.",
  ],
];
function home() {
  return `<section class="hero"><div><span class="eyebrow">YOUR PEOPLE. YOUR SPACE.</span><h1>A little order.<br>A lot of<br>possibility.</h1><p>Give your Discord community room to grow. Seep brings moderation, AI assistance and thoughtful server design together.</p><div class="actions"><a class="button" href="${invite}">Add to Discord ↗</a><a class="button secondary" href="#templates">Explore templates</a></div><span class="subtle">Open-source software · Your hosting · Your rules</span></div><img class="hero-art" src="assets/seep-cover-1024x576.png" alt="Seep logo on a black and silver background"></section><div class="rule"><span>MODERATION & COMMUNITY</span><span>PRIVATE AI ASSISTANCE</span><span>REVIEWED SERVER BUILDS</span><span>NO CODE EXECUTION</span></div><section class="section"><div class="section-head"><h2>Less busywork.<br>More belonging.</h2><p>Useful tools, a clear workspace, and control over the details that make a server feel like yours.</p></div><div class="grid">${featureCards.slice(0, 3).map(card).join("")}</div></section><section class="section card"><span class="eyebrow">START WITH A PLAN</span><h2>Your next server<br>starts here.</h2><p>Explore eleven starter layouts. Edit and export a plan directly in your browser, then connect your host to build it.</p><div class="actions"><a class="button" href="#dashboard">Open your workspace ↗</a><a class="button secondary" href="#docs">Read the setup guide</a></div></section>`;
}
const card = ([id, name, description]) =>
  `<article class="card"><span class="index">${id}</span><h3>${name}</h3><p>${description}</p></article>`;
function workspace() {
  return (
    title(
      "SEEP WORKSPACE",
      "A home for your community.",
      "This public frontend can plan and export templates. Live Discord controls and AI require your running backend.",
    ) +
    `<div class="workspace"><aside aria-label="Workspace navigation"><a href="#templates">Template studio</a><a href="#docs">Command directory</a><a href="#features">Modules</a></aside><section class="stack"><div class="card"><span class="tag">Backend connection required</span><h2>Connect your dashboard</h2><p>Sign in with Discord on your trusted Seep host. Only manageable servers appear. This Pages site does not request your bot token or store Discord sessions.</p><form id="connect"><label class="field">Your hosted member dashboard URL<input id="backend" type="url" placeholder="https://seep.your-domain.example" required></label><button>Continue to Discord login ↗</button></form><p class="subtle">Owner controls remain on the protected owner service. For a remote host, use the documented SSH tunnel. A public backend address has not been configured for this deployment.</p></div><div class="grid">${featureCards.slice(1, 3).map(card).join("")}</div></section></div>`
  );
}
function templates() {
  return (
    title(
      "TEMPLATE STUDIO",
      "Make space for something good.",
      "Choose a starter, edit the portable JSON, and export it. No Discord server changes happen here.",
    ) +
    `<div class="grid">${Object.keys(data.templates)
      .map(
        (key, i) =>
          `<article class="card"><span class="index">${String(i + 1).padStart(2, "0")}</span><h3>${esc(key[0].toUpperCase() + key.slice(1))}</h3><p>${data.templates[key].categories.reduce((n, c) => n + c.channels.length, 0)} channels · private staff area · ordinary member role</p><button class="secondary small" data-template="${key}">Use template ↗</button></article>`,
      )
      .join(
        "",
      )}</div><section class="section two"><div class="card"><h2>Edit your plan</h2><label class="field">Import template<input id="import" type="file" accept=".json"></label><label class="field">Portable template JSON<textarea id="editor" spellcheck="false" aria-describedby="editor-help"></textarea></label><p id="editor-help" class="subtle">Version 1 supports names, ordinary roles, category privacy and channel types. Permission overwrites, messages and secrets are not supported.</p><div class="actions"><button id="preview">Validate & preview</button><button id="export" class="secondary">Export JSON</button></div><p id="editor-status" role="status"></p></div><div class="card"><h2>Layout preview</h2><div id="layout" class="empty">Select a starter to begin.</div><p class="subtle">Building requires administrator authorization and a fresh confirmation on your Seep host. Forum, announcement and stage channels require Discord Community features.</p><a class="button secondary" href="#dashboard">Connect to build ↗</a></div></section>`
  );
}
function docs() {
  return (
    title(
      "DOCUMENTATION",
      "Know what happens next.",
      "Setup, commands and the boundaries that keep your community under your control.",
    ) +
    `<div class="two"><section class="card"><h2>Start here</h2><ol><li>Invite seep to a server you manage. The invite grants no permissions automatically.</li><li>Configure required channel and role permissions. Enable Member and Message Content intents for features that need them.</li><li>Run the backend and local AI on a suitable host. Keep credentials in environment variables.</li><li>Register your backend’s <code>/auth/callback</code> URL in Discord OAuth2.</li><li>Open the hosted dashboard, sign in, select a server and configure modules.</li></ol><a href="https://github.com/JoeMamiMarco/fainted-discord-bot/blob/main/docs/HOSTING.md">Full hosting guide ↗</a><details><summary>What GitHub Pages can do</summary><p>Serve this website and template studio. It cannot run Discord gateway connections, the AI model, databases or secret-dependent APIs.</p></details><details><summary>What templates copy</summary><p>Supported channel names and types, category privacy, ordering and ordinary roles. No messages, member records, webhooks, integrations or privileged permissions. Exact duplication and complete rollback are not promised.</p></details><details><summary>Coding privacy and limits</summary><p>No execution. Known secret patterns are redacted, but remove secrets yourself. Context is off by default; when enabled, it stays in host memory for up to 30 minutes. Use /code reset to delete it. Limit: 20 requests per user per server per hour, with a 10-second cooldown. An optional external coding provider receives submitted code when enabled by the host.</p></details></section><section class="card"><h2>Command directory</h2><label class="field">Find a command<input id="command-search" placeholder="Search moderation, code, templates…"></label><div id="commands"></div></section></div>`
  );
}
function legal(kind) {
  return (
    title(
      "TRANSPARENCY",
      kind === "privacy" ? "Privacy, plainly." : "Terms & project status.",
      "Draft information for this open-source deployment. The host operator must finalize these policies before offering a public service.",
    ) +
    `<section class="card"><h2>${kind === "privacy" ? "What is stored" : "Use responsibly"}</h2><p>${kind === "privacy" ? "This static site processes template drafts in your browser; it does not store Discord sessions or bot credentials. Your Seep backend stores server configuration, moderation records and activity in SQLite. Saved dashboard chats persist until deleted. Coding context is optional and temporary. Discord OAuth is handled only by the backend. Fonts are loaded from Google Fonts; GitHub serves this site and may collect hosting request logs." : "Only manage servers you are authorized to administer. Review AI output and build plans before use. The software is provided without uptime, correctness or recovery guarantees. Hosting services and Discord apply their own terms and limits. Do not submit secrets or use imported templates to copy content you do not own."}</p><p>For deletion requests or problems, contact your server’s Seep host operator. Do not post tokens, private code or personal data in public GitHub issues.</p><a class="button secondary" href="https://github.com/JoeMamiMarco/fainted-discord-bot/issues">Report a software issue ↗</a></section>`
  );
}
function validate(value) {
  if (
    !value ||
    value.format !== "seep-template" ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 80
  )
    throw Error("Use a named Seep template version 1.");
  const p = value.plan;
  if (
    !p ||
    !Array.isArray(p.roles) ||
    p.roles.length > 8 ||
    !Array.isArray(p.categories) ||
    !p.categories.length ||
    p.categories.length > 50
  )
    throw Error("Invalid roles or categories.");
  const allowed = (o, keys) => {
    if (Object.keys(o).some((k) => !keys.includes(k)))
      throw Error(
        "Unsupported fields: permissions and private content cannot be imported.",
      );
  };
  allowed(value, ["format", "version", "name", "plan"]);
  allowed(p, ["roles", "categories"]);
  const name = (x) => {
    if (
      typeof x !== "string" ||
      !x.trim() ||
      x.length > 60 ||
      /[\r\n@]/.test(x)
    )
      throw Error("Names must be 1–60 characters without @ or newlines.");
  };
  p.roles.forEach(name);
  if (
    p.roles.some((r) =>
      /^(admin|administrator|owner|moderator|staff)$/i.test(r),
    )
  )
    throw Error("Use ordinary roles only.");
  let total = 0;
  const categories = new Set();
  for (const c of p.categories) {
    allowed(c, ["name", "private", "channels"]);
    name(c.name);
    if (categories.has(c.name.toLowerCase()))
      throw Error("Duplicate category.");
    categories.add(c.name.toLowerCase());
    if (
      typeof c.private !== "boolean" ||
      !Array.isArray(c.channels) ||
      !c.channels.length ||
      c.channels.length > 50
    )
      throw Error("Use 1–50 channels per category and a privacy flag.");
    const seen = new Set();
    for (const ch of c.channels) {
      allowed(ch, ["name", "type"]);
      name(ch.name);
      if (
        !["text", "voice", "forum", "announcement", "stage", "media"].includes(
          ch.type,
        )
      )
        throw Error("Unsupported channel type.");
      if (seen.has(ch.name.toLowerCase())) throw Error("Duplicate channel.");
      seen.add(ch.name.toLowerCase());
      total++;
    }
  }
  if (total > 450) throw Error("Maximum 450 channels per template.");
  return value;
}
function bind(route) {
  if (route === "dashboard")
    document.querySelector("#connect").onsubmit = (e) => {
      e.preventDefault();
      try {
        const url = new URL(document.querySelector("#backend").value);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.pathname !== "/"
        )
          throw Error("Use the HTTPS origin of your trusted Seep host.");
        location.href = url.origin;
      } catch (e) {
        notify(e.message);
      }
    };
  if (route === "docs") {
    const render = () => {
      const q = document.querySelector("#command-search").value.toLowerCase();
      document.querySelector("#commands").innerHTML =
        data.commands
          .filter((c) =>
            (c.name + " " + c.description).toLowerCase().includes(q),
          )
          .map(
            (c) =>
              `<details><summary>/${esc(c.name)}</summary><p>${esc(c.description)}</p>${(
                c.options || []
              )
                .filter((o) => o.type === 1)
                .map(
                  (o) =>
                    `<p><code>/${esc(c.name)} ${esc(o.name)}</code> ${esc(o.description)}</p>`,
                )
                .join("")}</details>`,
          )
          .join("") || "<p>No matching commands.</p>";
    };
    document.querySelector("#command-search").oninput = render;
    render();
  }
  if (route === "templates") {
    const editor = document.querySelector("#editor");
    const render = () => {
      try {
        selected = validate(JSON.parse(editor.value));
        document.querySelector("#layout").className = "";
        document.querySelector("#layout").innerHTML = selected.plan.categories
          .map(
            (c) =>
              `<h3>${c.private ? "Private · " : ""}${esc(c.name)}</h3>${c.channels.map((ch) => `<div class="channel">${esc(ch.type)} · ${esc(ch.name)}</div>`).join("")}`,
          )
          .join("");
        document.querySelector("#editor-status").textContent =
          "Valid structural template. No server changes made.";
        return true;
      } catch (e) {
        document.querySelector("#editor-status").textContent = e.message;
        return false;
      }
    };
    document.querySelectorAll("[data-template]").forEach(
      (b) =>
        (b.onclick = () => {
          selected = {
            format: "seep-template",
            version: 1,
            name: b.dataset.template,
            plan: structuredClone(data.templates[b.dataset.template]),
          };
          editor.value = JSON.stringify(selected, null, 2);
          render();
          editor.focus();
        }),
    );
    document.querySelector("#preview").onclick = render;
    document.querySelector("#export").onclick = () => {
      if (!render()) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(selected, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "seep-template.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    document.querySelector("#import").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 128000) {
        notify("Maximum template size is 128 KB.");
        return;
      }
      editor.value = await f.text();
      render();
    };
    if (selected) {
      editor.value = JSON.stringify(selected, null, 2);
      render();
    }
  }
}
function render() {
  const route = location.hash.slice(1) || "home";
  const views = {
    home,
    features: () =>
      title(
        "THE TOOLKIT",
        "Good tools. Clear boundaries.",
        "Seep includes these capabilities in its backend. Configure and test the features you enable in your own server.",
      ) +
      `<section class="grid section">${featureCards.map(card).join("")}</section>`,
    templates,
    docs,
    dashboard: workspace,
    privacy: () => legal("privacy"),
    terms: () => legal("terms"),
  };
  main.innerHTML = (
    views[route] ||
    (() =>
      title(
        "404",
        "This corner is quiet.",
        "The requested page does not exist.",
      ) + '<a class="button" href="#home">Back to seep</a>')
  )();
  document.title = "seep · " + route;
  bind(route);
  window.scrollTo(0, 0);
}
document.querySelector('a[href="#main"]').addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});
try {
  const response = await fetch("catalog.json");
  if (!response.ok) throw Error("Could not load the site catalog.");
  data = await response.json();
  window.addEventListener("hashchange", render);
  render();
} catch (e) {
  main.innerHTML =
    title("UNAVAILABLE", "Something didn’t load.", esc(e.message)) +
    '<button id="retry">Try again</button>';
  document.querySelector("#retry").onclick = () => location.reload();
}
