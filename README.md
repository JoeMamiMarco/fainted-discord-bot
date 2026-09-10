# Fainted

A Discord moderation and community bot, built from the visible features in your PeakBot / Onyx video. This is original code, with Discord slash commands, embeds, buttons, and reactions. It does not use PeakBot's private source, branding, or website. The repository's existing GitHub remote is retained.

## Start here

1. Double-click **Fainted Panel.exe**, open **Bot settings**, and fill your bot token, application ID, and server ID. The token field is hidden and saved only in `.env`.
2. In the [Discord Developer Portal](https://discord.com/developers/applications), create/select your application. Under **Bot**, obtain its token and enable **Server Members Intent** and **Message Content Intent**.
3. Invite the bot to your server using the application's installation/OAuth2 flow with the **bot** and **applications.commands** scopes. Grant the permissions listed below. Move the bot role above the normal members and roles it should manage.
4. Click **Start bot**. The dashboard checks your connection and syncs commands automatically. On this PC the runtime and local model are already installed. On a fresh clone, install Node.js 24+ and dependencies; use **Install / repair AI** for optional AI setup.
5. In Discord, run `/help`, then `/settings channels`, `/settings roles`, and `/settings automod`.

This PC uses the bundled Node.js 24 runtime in `runtime/node/`, so an older system installation cannot break startup. The dashboard falls back to the Codex runtime or Node.js on PATH on other PCs. A portable install on another PC requires **Node.js 24 or newer** and `npm install` in this folder. Keep the panel open while the bot runs. **Stop** or closing the panel stops its bot, AI server, and model worker processes. For 24/7 use, run one instance on an always-on machine with persistent storage.

### Fill in `.env`

| Setting             | Required    | Where to get it                                                                                                     |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`     | Yes         | Developer Portal → your application → Bot → token                                                                   |
| `DISCORD_CLIENT_ID` | Yes         | General Information → Application ID                                                                                |
| `DISCORD_GUILD_ID`  | Yes         | Discord → enable Developer Mode in Advanced settings → right-click your server → Copy Server ID                     |
| `OPENAI_API_KEY`    | OpenAI only | Your own OpenAI API key; separate API billing applies                                                               |
| `OPENAI_MODEL`      | OpenAI only | A model available to your API account that supports Responses structured outputs, plus image inputs for screenshots |
| `DATABASE_PATH`     | No          | Default: `./data/fainted.sqlite`                                                                                    |

The bot runs in one configured server. Channel and role IDs are selected through Discord commands; you do not need to put them in `.env`. `/settings clear` removes a previously configured channel or role. AutoMod is off until you enable it.

### Lightweight local AI and Windows panel

**Fainted Panel.exe** is a small native Windows Forms dashboard, built from `desktop/FaintedPanel.cs` and `desktop/Dashboard.cs`. It uses the .NET Framework included with Windows, without an Electron installation. Keep the executable inside this repository folder; it needs the accompanying source and dependencies. Rebuild it with `desktop/build-panel.cmd`.

- **Start bot / Stop bot / Restart:** one-click controls with real connection status, current startup step, uptime, Discord latency, and bot memory. Commands sync automatically. Closing the dashboard disconnects gracefully and ends its owned bot/AI processes. Duplicate instances are blocked, including legacy launchers.
- **Bot settings:** edit your three Discord credentials locally. No AI API key is needed.
- **Sync commands:** register or update this application's commands in the configured server.
- **Install / repair AI:** install the pinned portable runtime and download the small model. Already completed on this PC. On another PC the official runtime archive is about 1.5 GB temporarily; only approximately 72 MB of CPU files are kept after extraction.
- **Test local AI:** generate and validate a harmless sample plan, report the time, and shut down the AI service without connecting to Discord.

Default model: [Qwen3-VL 2B Instruct](https://ollama.com/library/qwen3-vl:2b-instruct), approximately 1.9 GB on disk. It can accept descriptions and screenshots. Fainted limits generation to four CPU threads, a 4,096-token context, one concurrent model request, and no GPU offload. It unloads the model after each request. This trades response speed for lower idle memory use. Resource use depends on the request; the 1.9 GB download size is not a RAM cap.

The local service binds only to `127.0.0.1:11435`, with Ollama cloud features disabled. Runtime files, models, logs, and the Ollama child process's private profile are inside `runtime/`. No account-wide Ollama install, login, API key, or Windows startup task is required. The bot never switches to a paid provider on failure. It still needs internet to connect to Discord; screenshot inputs are downloaded from Discord before local analysis.

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11435
OLLAMA_MODEL=qwen3-vl:2b-instruct
```

In Discord use `/server plan description:A gaming community with rules, general chat and a staff room ai:true`. Review the draft before pressing Build. Known staff/log channel names are placed in a private staff category. Your existing Discord role/permission checks still gate every actual server change.

### If startup needs attention

The dashboard keeps the actual error visible and re-enables **Retry start**. A redacted activity log is saved in `runtime/dashboard.log`. Credentials are never included in Git.

- **Online / limited:** Discord has not enabled a required privileged intent. Open **Developer Portal** from the dashboard, select **Bot**, enable **Server Members Intent** and **Message Content Intent**, save, then press **Restart**. Basic slash commands work while these settings are missing; member join/leave features and content-based AutoMod require the relevant intent. Enabling AutoMod or reviewing inactive members gives a clear error when its intent is unavailable.
- **Invalid token or server access:** fix the three fields in **Bot settings**, and check that the application is invited to that server.
- **AI unavailable:** moderation stays online. Stop the bot and use **Install / repair AI**, then start again. AI never falls back to a paid service.
- **Another instance is running:** close the other dashboard or console launcher. This version uses a local instance lock on port 11436, released automatically on exit.
- **Connection blocked:** allow Node.js through your network/firewall and retry.

### Optional cloud alternative (Gemini)

Google lists `gemini-2.5-flash-lite` text/image input and text output as free of charge on its limited [Free tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite). Availability and quotas depend on your account and region. This is not an unlimited shared API key.

1. Sign into [Google AI Studio](https://aistudio.google.com/apikey) and create your own API key.
2. Keep that project on the **Free tier**. Do not enable billing for this free setup; a billing-enabled project may charge for requests. The bot cannot inspect or enforce Google's project billing tier.
3. Paste the key locally into `.env` after `GEMINI_API_KEY=`. Change `AI_PROVIDER` from `ollama` to `gemini`; set `GEMINI_MODEL=gemini-2.5-flash-lite`.
4. Restart the bot. Run `SETUP-AND-START.cmd` once to refresh the command descriptions, then use `/server plan description:A gaming community ai:true`.

Leave `OPENAI_API_KEY` and `OPENAI_MODEL` blank. When Gemini reaches its quota, the bot reports the limit; it does not switch to OpenAI or a paid model. You can keep using all moderation features and template plans with `ai:false`. Google may use free-tier submitted content to improve its products; keep confidential information out of AI plan descriptions/screenshots. No live Gemini call has been tested without your key.

### Bot permissions

Enable **View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Add Reactions, Manage Messages, Moderate Members, Kick Members, Ban Members, Manage Channels, Manage Roles, and Manage Server**. Manage Server is used for invite tracking. Administrator is not required. Channel overrides must also allow the bot to work in each configured channel.

Moderator command visibility uses the corresponding native Discord permission; the handler checks it again. Normal members can use their rank, leaderboards, ticket buttons, role buttons/reactions, onboarding, and poll voting. Staff channels created by the planner are available to administrators, the bot, and the configured support role.

## Features from the video

| Visible feature                           | Fainted implementation                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Describe a server and review a build plan | `/server plan description:...`; preview, JSON attachment, requester-only Build button                                                    |
| AI server design                          | Use `ai:true`; the installed local model creates the draft without an API key                                                            |
| Clone a layout from a screenshot          | Attach a PNG/JPEG/WebP to `/server plan` with `ai:true`; generates a proposed layout, not an exact server backup                         |
| Channels and roles                        | Builder adds missing categories, text/voice channels, and normal roles; private staff category support                                   |
| Welcome/goodbye messages                  | `/settings channels` and `/settings messages`, with `{user}`, `{name}`, `{server}`, `{count}` placeholders                               |
| Auto roles                                | `/settings roles auto:@Member`; only ordinary roles below the bot                                                                        |
| Reaction roles                            | `/role-panel`; persistent Unicode reaction and button role controls                                                                      |
| Onboarding                                | `/onboarding rules:... role:@Member`; rules acknowledgment and optional role grant                                                       |
| Ticket system                             | `/settings roles support:@Support`, then `/ticket panel`; private channels, one open ticket per person, owner/staff close                |
| Inactive kick system                      | `/inactive days:30`; explicit preview and confirmation, up to 10 members per run                                                         |
| Poll system                               | `/poll create question:... options:Yes\|No`; persistent one-vote-per-member buttons; `/poll close`                                       |
| Moderation                                | Warnings, history, timeout/removal, kick, ban/unban, purge, slowmode, channel lock/unlock                                                |
| XP and leveling                           | 15 XP at most once per minute; `/rank`, `/leaderboard`, `/settings leveling`                                                             |
| Invite tracking and leaderboard           | `/invites`, `/invite-leaderboard`; observed, uniquely attributable referrals                                                             |
| Auto moderation                           | `/settings automod`; spam, mass mentions, Discord invite links, configurable blocked words; deletes violating messages                   |
| Server logging                            | Private configured log channel: bot moderation, joins/leaves, bans, channel creation/deletion, deleted-message metadata, tickets, builds |
| Activity analytics                        | `/analytics days:30`; actual message totals, active-member count, daily CSV for 1–90 days                                                |

The demo also says “much more” without identifying those features. There is no claim to implement undisclosed features. This version uses Discord itself as the control interface; it does not include the separate animated web dashboard from the video. Analytics exports real data rather than reproducing the demo's chart or sample numbers.

## First setup examples

```text
/settings channels welcome:#welcome goodbye:#goodbye logs:#mod-logs
/settings roles auto:@Member support:@Support
/settings messages welcome:Welcome {user} to {server}! Read #rules and introduce yourself.
/settings automod enabled:true block_invites:true mentions:6 spam:6
/ticket panel
/onboarding rules:Be respectful. No spam. Follow Discord's rules. role:@Member
/role-panel role:@Updates label:Get update notifications emoji:✅
/server plan description:A gaming community with hangout and showcase channels
```

To require rules acceptance before a Member role, use the onboarding role and leave `autoRole` unset. The bot's onboarding panel is distinct from Discord's native Community Onboarding configuration.

## Behavior and limits

- **Builds are additive.** Existing messages/channels are not deleted or renamed. Existing matching categories must have compatible visibility. Created roles have no special permissions. Review the plan before applying it. If a build partly fails, the response reports how many items were created; a new preview can reuse them. Server snapshots export names and structure, not permissions/messages; there is no restore/import command.
- **Template mode is a template.** Without `ai:true`, descriptions select a coding, gaming, or general community layout. Local AI mode requires the model to be installed and the panel running; cloud alternatives require their own API keys. A smaller local model may need a more specific prompt. Local plans default to at most 12 channels; descriptions such as “at most eight channels” set a smaller limit, up to a maximum of 30. A screenshot does not reveal hidden channels or exact permission settings.
- **Invite attribution is best-effort.** Uses observed invite-count changes. Concurrent joins, vanished single-use invites, vanity links, and offline periods may be unknown. Referrals count unique observed members once; leaving and rejoining does not inflate counts. This is not a fraud-proof rewards system.
- **Inactivity means no observed messages**, not proven absence. Requires the requested number of days since first startup; excludes bots and anyone with an assigned role. Offline time and inaccessible channels can make the evidence incomplete. No unattended mass-kick schedule runs.
- **Analytics starts when the bot runs.** It cannot recover historical messages or missed activity. XP ignores deleted AutoMod violations and is independent of message totals. Only the last 91 days of daily activity are retained.
- **AutoMod is bot-side.** It checks new and edited messages while online, exempts members with Manage Messages or Administrator, and deletes violations without automatic bans/timeouts. Blocked words use case-insensitive substring matching. Discord native AutoMod rules are not installed.
- **Locks change @everyone's Send Messages overwrite only.** Role-specific allows, administrator access, and thread permissions can still permit messages. Unlock restores the recorded previous value.
- **Tickets close by hiding the channel from the opener**, keeping history for staff. Staff can later delete channels in Discord. No transcripts are sent outside the server. Administrators can see private channels as usual.
- **Role panels recheck privileges at use time.** Changing an opt-in role into a staff role makes the panel refuse assignments. Reactions and buttons both control the same role; mixing them may require removing/readding a reaction to match a button toggle.
- **Use one running instance per database.** In-process locks prevent duplicate confirmation clicks and ticket/poll races. This is not a distributed bot deployment.

## Data and secrets

`data/fainted.sqlite` stores settings, moderation reasons, member IDs/XP/last activity, daily counts, invite attribution, poll votes, role panels, ticket mappings, onboarding acknowledgments, and build previews. It does not archive message bodies or tokens. Keep this database private and back it up together with its SQLite sidecar files while stopped. Moderation and configuration records remain until you remove the database; normal member data and cases are not automatically erased on leave.

`.env`, `data/`, `runtime/`, and `node_modules/` are ignored by Git. No live token is included. AI planning defaults to a local Qwen model via Ollama. Optional Gemini mode uses its [structured JSON output](https://ai.google.dev/gemini-api/docs/structured-output). Google states that free-tier inputs and outputs may be used to improve its products. Only submitted plan descriptions and images are sent, not Discord chat history. OpenAI remains an optional alternative with `AI_PROVIDER=openai` and Responses storage disabled. The API is called only by an explicit `ai:true` plan request. Do not attach confidential screenshots unless you intend to send them to that API.

## GitHub Desktop

In GitHub Desktop use **File → Add local repository**, choose this `fainted-discord-bot` folder, and review the new files. Its `origin` points to `https://github.com/JoeMamiMarco/fainted-discord-bot.git`. Commit and push when you want to upload the source. The bot itself does not push automatically. The source and small Windows panel executable can be committed; credentials, downloaded runtimes, model weights, and server data stay local. GitHub Desktop was not available during creation, so the files were prepared directly in the existing clone.

## Development and validation

```sh
npm install
npm test
npm run check
npm run register
npm start
```

`pnpm-lock.yaml` pins the installed dependency tree; `pnpm install --frozen-lockfile` reproduces it. Tests cover role/permission boundaries, duration limits, AutoMod, durable data, XP, plan validation, duplicate-click locks, requester-bound confirmations, ticket access, and poll voting. Live Discord integration and AI calls require your credentials and have not been exercised by the offline tests.

### Live smoke test after filling `.env`

Use a small test server: run `/help`; set private logs; warn and timeout a lower-role test account; post a role panel and add/remove its role; open/close a ticket from that account; create/vote/close a poll; build a reviewed template; restart and verify warnings, XP, panels, and polls persist. Test AutoMod with harmless configured words and verify ordinary messages remain. Review the bot console if a channel permission or privileged intent is missing.

Implementation references: [discord.js 14.27.0](https://discord.js.org/docs/packages/discord.js/14.27.0), [Discord gateway intents](https://docs.discord.com/developers/events/gateway), and [Discord permission hierarchy](https://docs.discord.com/developers/topics/permissions).
