# Website and backend deployment

## Public website

GitHub Pages serves `site-dist` using `.github/workflows/pages.yml`. The site uses relative asset paths and hash routes, so repository subpaths and page refreshes work without a rewrite server. `404.html` provides recovery. Run `pnpm build` to generate the site. Only explicit public assets and command/template metadata are copied; `.env`, SQLite files, model files and dashboard bearer tokens are excluded.

The public template studio validates and exports structural templates in the browser. It cannot log in to Discord, create channels, run code or operate the bot. Open Dashboard accepts the HTTPS origin of a trusted Seep member backend and navigates there. OAuth and all authenticated operations remain same-origin on that backend. No cross-site cookie workarounds or permissive CORS are used.

## Linux backend preparation

Use an always-on Linux host with Node.js 24+, pnpm 10, SQLite-compatible local storage, and at least 6 GB available RAM for the configured local vision model. More CPU cores improve response time. No free hosting account or public domain is supplied by this repository.

1. Clone the repository into `/opt/seep` under a dedicated non-root service account. Run `pnpm install --frozen-lockfile`.
2. Install Ollama using its official distribution. Configure its service to listen at `127.0.0.1:11435`; never expose this port publicly. Set one parallel request and one loaded model. Pull `qwen3-vl:4b-instruct` against that endpoint.
3. Copy `.env.example` to `.env`, restrict it to the service account (mode 600), and enter Discord application credentials. Set `OLLAMA_EXTERNAL=true`, `SEEP_AUTOSTART=true`, `RICH_PRESENCE_ENABLED=false`, and `MEMBER_DASHBOARD_ORIGIN=https://YOUR-DOMAIN`.
4. Keep `MEMBER_DASHBOARD_BIND=127.0.0.1`. A reverse proxy on the same host exposes only port 11438. Port 11437 is the private owner API and must not be public.
5. Start `node --env-file=.env src/dashboard-server.js` under systemd with `WorkingDirectory=/opt/seep`, a dedicated non-root user, `Restart=on-failure` and `KillMode=control-group`. Keep `/opt/seep/data` and `/opt/seep/runtime` writable and backed up. Keep all other project files read-only to the service where practical.
6. Point your domain at the host and configure HTTPS. Example Caddy site: `YOUR-DOMAIN { reverse_proxy 127.0.0.1:11438 }`. Preserve the original Host header. Allow inbound HTTPS only (and administrative SSH as required).
7. In Discord Developer Portal, register exactly `https://YOUR-DOMAIN/auth/callback`. Enable required intents. Invite seep to each managed server and assign the required role/channel permissions.
8. Open the member website and complete Discord login. For private owner Start/Stop controls, use `ssh -L 11437:127.0.0.1:11437 SERVICE_HOST` and open the owner URL recorded in `runtime/dashboard-session.json`. That URL is a credential: never publish it or paste it into the Pages frontend.

The Linux external-Ollama path is prepared in code but has not been exercised on a provisioned cloud VM. Verify shutdown, restart, persistence, OAuth, HTTPS and actual Discord operations on the selected host before serving users. The desktop-only Rich Presence feature requires Windows Discord and is disabled on a cloud host.

## Remaining account-specific actions

Provision the backend host, install/configure Ollama, supply credentials, configure DNS/HTTPS and register the OAuth callback. Then test Discord login and server selection with the real account. GitHub Pages does not replace any of these services. Keep usage within your provider's free limits; no paid resources are provisioned by this repository.

## Provider configuration and cost controls

Normal chat and server planning use loopback Ollama. Coding also defaults to local AI. `CODE_AI_PROVIDER=compatible` optionally uses an HTTPS chat-completions endpoint in `CODE_AI_URL`, model `CODE_AI_MODEL` and server-only `CODE_AI_KEY`. This transmits submitted code to that provider and can incur its charges. Set provider-side spending limits before enabling it. Requests are capped at 1,600 output tokens and 20 per user/server/hour. HTTP 429 gets one bounded retry; failures never silently switch providers. Quotas are in memory and reset when the bot restarts; they are not a substitute for a provider billing cap.

## Recovery and privacy

Private templates live in the existing SQLite KV table under versioned records, isolated by server and actor. Build records contain the draft, initiating actor, prior resource IDs, created IDs, status and errors. Cancellation is cooperative between Discord operations. Resume requires a fresh preview and confirmation and reuses matching resources. Created channels can later contain user content; automatic rollback deletion is therefore not implemented. Review resource IDs and manually remove only resources you intend to delete. Back up the database before upgrading.

Coding context is off by default and stored only in memory when enabled. It expires logically after 30 minutes, is purged on subsequent requests, and is deleted by `/code reset`; a host restart clears it. Secret redaction recognizes common patterns but is not exhaustive. No user-submitted code is executed. Private dashboard chats use separate persistent chat storage and can be deleted through the sidebar.

## Operational limits

No public community template gallery/moderation service, distributed job queue, multi-process sharding, automatic full rollback, privileged permission cloning, or production SLA is provided. Imported templates intentionally reject unsupported fields. Existing framework code is JavaScript; syntax validation and behavior tests are enforced, but a full strict-TypeScript migration is not claimed. Legal pages are labeled drafts and need operator review. Complete live Discord feature parity and WCAG conformance require further audits.
