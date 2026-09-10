# seep

A black-and-white Discord moderation bot with two Windows desktop dashboards and free local AI.

## Open the dashboards

- **Owner:** `seep dashboard.exe` has Start, Stop and Restart. Closing the owner window stops the bot, local AI and member service. `START-SEEP.cmd` also starts the bot automatically.
- **Members:** `seep member dashboard.exe` has Discord login and server selection, with no bot controls. Closing it does not stop the host.
- Both EXEs need the supplied WebView2 DLLs beside them. Windows x64 and Microsoft Edge WebView2 are required. The owner computer must stay on and connected.

## First setup

On a fresh clone, install Node.js **24+**, run `npm install`, and copy `.env.example` to `.env`. Fill the bot token, application ID and owner server ID, or use **Bot Settings**. Never share `.env`.

In Discord Developer Portal, enable **Server Members Intent** and **Message Content Intent**. Invite seep with `bot` and `applications.commands` scopes. Give it the permissions needed by the features you enable, and move its role above roles/members it should manage. Discord owner and role hierarchy rules always apply.

Click **Install / repair AI** while the bot is stopped. The CPU-only local runtime and `qwen3-vl:4b-instruct` model download once (model download approximately 3.3 GB). No AI API key, paid service or paid fallback is used. Press Start bot after setup.

## Discord login for members

In the owner dashboard's Bot Settings, enter the application's **OAuth2 Client Secret** (different from its bot token). It is stored locally, never displayed back, and must not be shared with members. Register the exact redirect under Developer Portal → OAuth2:

`http://127.0.0.1:11438/auth/callback`

Keep `http://127.0.0.1:11438` as the member origin for use on this computer. Open the member EXE and choose Continue with Discord. The login finishes in the browser and pairs securely with the desktop app.

Only servers the signed-in user owns or has Manage Server/Administrator permissions in are listed. Seep must be invited to a server before managing it. Server building also requires Manage Channels and Manage Roles. Changing automation settings or accessing backups requires Administrator. Permissions are rechecked on each request; member accounts cannot access owner start/stop controls or bot credentials.

For users on other computers, host the member service behind an HTTPS reverse proxy. Set `MEMBER_DASHBOARD_ORIGIN` to that public HTTPS origin, register its `/auth/callback` URL, and put the same origin in `member-server-url.txt` beside the member EXE. Proxy **11438 only**, never owner port **11437**. No public host or domain is configured automatically. The default localhost URL works only on the owner's PC.

Distribute only the member EXE, the three WebView2 DLLs, the server address file, and the third-party licenses. Do not distribute `.env`, `data/`, `runtime/` or your owner dashboard installation.

## Conversations and local AI

Mention `@seep your question` in Discord, or reply to a seep message without mentioning it. Every successful answer ends with:

`-# reply to this message to continue`

Reply context includes the preceding seep message and its original question. Detailed answers split into messages below Discord's 2,000-character limit. Bots and webhooks are ignored.

The AI Assistant and AI Server Builder save chats in a sidebar, privately by Discord account and server. Resume or delete chats; limits are 100 saved chats per account/server and 100 exchanges per chat. Recent conversation history guides follow-up answers and layout refinements.

Complex questions receive an 8K context window and larger response budget; simple questions use 4K. The model uses four CPU threads, no GPU, one inference at a time, and unloads after each request. Instructions encourage checking constraints, handling ambiguity and acknowledging uncertainty. This improves the existing small model; it is not a newly trained model or a replacement for a much larger hosted model. There is no web access.

AI server creation requires a preview and explicit Build action. Drafts expire in 15 minutes and are bound to their creator and server. Builds add missing categories, text/voice channels and ordinary roles. Existing channels are retained. Staff/log categories are private. Limits: 6 categories, 8 roles, 30 channels. A non-AI template is also available. `/server plan` supports Discord-uploaded screenshots. Renaming/deleting existing channels and arbitrary code execution are not supported.

## Feature coverage

| Area | Included |
| --- | --- |
| Moderation | Warn/history, timeout, kick, ban/unban, purge, slowmode, lock/unlock; action and role hierarchy checks |
| Auto moderation | Spam/mention limits, invite blocking, custom words, staff exemptions, opt-in local AI classification in selected channels |
| Security | Account-age checks and optional kick; join-rate raid lockdown/restoration; opt-in anti-nuke dangerous-role removal |
| Welcome/goodbye | Branded embeds, custom text/title/image, optional DM and ordinary autorole |
| Roles | Button/reaction roles and agreement/verification onboarding |
| Tickets | Private channels, support role, claims, priorities, closing, latest-100-message transcript |
| XP | Message cooldown, multiplier, voice XP, level rewards, decay, ranks/leaderboards |
| Giveaways | Timed entries, role/account-age requirements, multiple winners, ending/rerolls |
| Polls | Timed single/multiple votes, anonymous/named voters, results |
| Events | Discord events, RSVP buttons and channel reminders |
| Voice | Join-to-create rooms, user limit, empty-room cleanup |
| Analytics | Observed message/member activity, daily trends, top channels, moderation counts, local AI summary |
| Invites | Attribution, leaderboards, milestone rewards; ambiguous/vanity/offline joins marked unknown |
| Embeds | Black-and-white preview, custom body/footer/images, bot or bot-owned webhook delivery |
| Backups | Local layout/config snapshots, daily backups, additive layout restore within builder limits |
| Inactivity | Preview and opt-in daily cleanup of observed inactive, unprivileged members |
| Auto responses | Phrase matching without loading AI |

Destructive automation is opt-in. Configure channels, roles and thresholds first. AI moderation samples selected text messages to stay light; it is not exhaustive image moderation. Analytics starts when seep observes activity. Backups do not recover messages or automatically reapply saved configuration.

PeakBot references informed the navigation and layout. This is an independent implementation, not PeakBot source or guaranteed complete feature parity. Sticky-role restoration, booster-role customization, historical analytics backfill and an external support service are not included.

## Rich Presence

The owner desktop app connects to the signed-in **Discord desktop user's** local RPC connection and displays seep artwork, elapsed time and dashboard activity. It does not require or use a Discord user token. Bot gateway status is separate; custom Rich Presence cards are for the desktop user's activity.

Toggle it in Bot Settings → Discord Rich Presence. Closing the owner dashboard clears it. Enable activity sharing in Discord if you want others to see it. Discord controls the surrounding card's theme; the supplied art itself is black and white. There are no fabricated party/join secrets or fake join actions.

Defaults use the artwork's public GitHub image URLs. To use uploaded Rich Presence art instead, upload the assets in Developer Portal and set `RICH_PRESENCE_LARGE_IMAGE=seep_background` and `RICH_PRESENCE_SMALL_IMAGE=seep_logo`. The default URL image approach needs the asset files to be pushed to GitHub first.

## Artwork and developer files

`assets/seep-logo-1024.png` is a 1024×1024 PNG on opaque black, under 10 MB. Its prompt is recorded in `assets/logo-prompt.txt`. Additional background, cover and video assets are stored beside it with their dimensions in the filenames.

`desktop/build-panel.cmd` rebuilds both EXEs using the Windows .NET C# compiler. WebView2 licenses are in `desktop/licenses/`.

`npm test` runs moderation, startup, AI, OAuth and HTTP integration tests. Stop the live bot before the full suite: a startup test checks the instance lock. Tests cover permission revocation, user/server chat isolation, CSRF, OAuth state binding, owner-control exclusion, reply continuation and preview ownership. Real Discord OAuth login additionally needs the configured client secret and registered redirect.

Data stays in `data/` (SQLite); logs, downloaded AI and private desktop profiles stay in `runtime/`. Both are ignored by Git. OAuth sessions and tokens stay only in host memory and expire; a host restart requires another login. Saved chats persist across restarts.

Sources: [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2), [Permissions](https://docs.discord.com/developers/topics/permissions), [Rich Presence](https://docs.discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence), [WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/).

### Local AI model upgrade
The default is Qwen3-VL 4B Instruct. A ten-channel layout test took about 24 seconds, preserved all requested names and types, and reported approximately 4 GiB loaded in Ollama. Memory and speed vary with input, especially images; 4–6 GB is an operating target, not a hard cap. The previously downloaded 2B model stays installed. To revert, set `OLLAMA_MODEL=qwen3-vl:2b-instruct` in your local `.env` and restart the bot. This is a manual fallback, not an automatic retry.
