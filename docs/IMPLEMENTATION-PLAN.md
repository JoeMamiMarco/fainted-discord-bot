# Seep product upgrade plan

Baseline: main at deb939a. Existing Discord.js/Node 24, SQLite, local Ollama 4B, owner/member dashboards and OAuth are retained. No data migrations are required for versioned records stored in the existing KV table.

1. Audit existing commands, AI, plan validation, permissions, deployment and tests.
2. Add a bounded coding service shared by Discord and dashboard, with opt-in expiring context, secret redaction, attachment validation, quotas and no code execution.
3. Add portable, versioned private templates, presets, strict imports, structural copy, editable previews and recoverable build records.
4. Improve dashboard navigation and expose the new workflows. Publish an honest static public site and frontend on GitHub Pages, with backend-required features explicitly identified.
5. Add validation/build/deployment workflows and backend hosting documentation. Test critical journeys, review diff, push and verify Pages deployment.

Audit findings: existing build preview tokens are volatile; failed builds can partially create channels; normalization injects duplicate welcome/rules categories; source copying is limited; dashboard and local AI are coupled to Windows; no code-specific workflow or static site exists. OAuth is same-origin and should remain so: public Pages must never receive the owner bearer token or secrets. Existing tests cover behavior with mocks, not complete live Discord parity.

Scope decisions: do not execute submitted code; do not create a public template gallery without moderation infrastructure; imported permissions are rejected rather than silently granting power; existing-server content is never removed automatically. Free backend hosting remains dependent on an account and suitable compute.
