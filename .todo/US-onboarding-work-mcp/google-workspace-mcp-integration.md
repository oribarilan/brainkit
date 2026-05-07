# google-workspace-mcp-integration

## Context

Mirror of `m365-workiq-integration.md` for the Google side. When the user identifies their work vault as Google Workspace–based, onboarding offers an optional step to connect the agent to the **official Google Workspace MCP servers** (Gmail, Drive, Calendar, People, Chat). brainkit only suggests and guides — it never edits `~/.gemini/settings.json`, never stores OAuth secrets, never enables GCP services on the user's behalf. On opt-in, brainkit prints the GCP setup + per-service `gcloud services enable` + OAuth client + MCP client config snippet + `/mcp auth …` walkthrough, then writes `[integrations.google_workspace] enabled = true` in `brainkit.toml`. When the MCP tools are present in the session, the agent uses them to enrich onboarding (org via `people`, recent meetings via `calendar`, active threads via `gmail`).

**Value delivered**: A user whose work life lives in Google Workspace gets the same one-question onboarding enrichment as M365 users — populated contacts, recognized projects, real meeting cadence — without brainkit ever touching their harness config or holding any credentials.

## Related Files

- `skills/onboarding/SKILL.md` — already branched in the M365 task; this task adds the Google leg of the choice
- `skills/integrations/google-workspace/SKILL.md` — **new**, provider-specific guidance
- `core/types.ts` — add `integrations.google_workspace` to `BrainkitConfig` (mirrors the M365 field)
- `core/vault.ts` — read/write the new config field
- `core/prompt-sections.ts` — surface the marker in the system prompt when set
- `core/__tests__/vault.test.ts` — config round-trip tests
- `core/__tests__/prompt-sections.test.ts` — prompt branch tests
- `docs/onboarding.md` — extend with the Google path
- `docs/features.md` — already mentioned by the M365 task; ensure both providers appear

## Dependencies

- **`m365-workiq-integration.md`** must be merged first. It establishes the `[integrations.*]` schema, the onboarding Phase 2 branch, and the prompt-section pattern. This task only adds the second leg of an existing fork.

## Acceptance Criteria

- [ ] `BrainkitConfig.integrations.google_workspace.enabled: boolean` is supported optionally; existing configs without it still parse.
- [ ] `core/vault.ts` reads/writes `[integrations.google_workspace] enabled = …` losslessly via `smol-toml`.
- [ ] `skills/integrations/google-workspace/SKILL.md` exists and contains:
  - When to suggest (only during onboarding, only after user identifies vault as Google-Workspace-based, only as an optional opt-in question that pairs with the M365 question).
  - Step-by-step setup the agent walks the user through:
    1. Pick / create a GCP project; ensure billing.
    2. Enable each MCP service the user wants: `gcloud services enable gmailmcp.googleapis.com drivemcp.googleapis.com calendarmcp.googleapis.com chatmcp.googleapis.com --project=PROJECT_ID` (people uses `people.googleapis.com`).
    3. Configure OAuth consent screen and create a Desktop OAuth client; capture client ID + secret.
    4. Print the `~/.gemini/settings.json` (or harness equivalent) `mcpServers` snippet with placeholders for client ID/secret/scopes — instruct the user to paste it themselves. brainkit must not write this file.
    5. Run `/mcp auth gmail`, `/mcp auth drive`, `/mcp auth calendar`, `/mcp auth people`, `/mcp auth chat` per chosen service.
  - Marker write: set `[integrations.google_workspace] enabled = true` only after the user confirms `/mcp list` shows the servers as Ready.
  - Enrichment recipes:
    - `people.list_directory_people` (or equivalent) → seed first contacts with role/team/timezone.
    - `calendar.list_events` over the last 14 days → infer recurring meetings, named collaborators, work rhythm summary.
    - `gmail.search_threads` for project-name keywords surfaced in onboarding Q&A → confirm/expand active project list.
    - `drive.search` for shared docs → suggest `01_projects/<name>/` dirs.
  - Graceful degradation: if any tool is missing, the agent surfaces only the enrichment that the available tools support, and continues onboarding without blocking.
  - OS branching for printed paths: `~/.gemini/settings.json` (mac/linux) vs `%APPDATA%\.gemini\settings.json` (windows).
- [ ] `skills/onboarding/SKILL.md` already references this skill via the M365 task; verify the Google branch reads cleanly.
- [ ] `core/prompt-sections.ts` adds a one-liner when `integrations.google_workspace.enabled === true`, telling the agent to prefer Google Workspace MCP tools for Gmail/Calendar/Drive/People/Chat lookups when available. If the M365 task introduced a `buildIntegrations` helper, reuse it; do not duplicate.
- [ ] No file outside `~/.config/brainkit/` and the vault is written by brainkit during this flow. Verified by a launcher / vault-write test (extend the test added by the M365 task).
- [ ] No new runtime npm dependencies are added.
- [ ] `docs/onboarding.md` documents the Google path end-to-end.
- [ ] `docs/features.md` reflects both providers.
- [ ] `just check` passes.

## Verification

**Automated** (preferred — confirm with user before adding):

- Unit test: parsing a `brainkit.toml` with and without `[integrations.google_workspace]` round-trips correctly.
- Unit test: `buildSystemPrompt` includes the Google hint iff `integrations.google_workspace.enabled === true`. If both M365 and Google are enabled, both hints appear.
- Unit/snapshot test: the printed `gcloud services enable …` command names match the official endpoints (`gmailmcp.googleapis.com`, `drivemcp.googleapis.com`, `calendarmcp.googleapis.com`, `chatmcp.googleapis.com`, `people.googleapis.com`) so doc drift surfaces in CI.
- Unit/snapshot test: the `mcpServers` JSON snippet template parses as valid JSON and contains the expected `httpUrl` per service.
- Cross-platform: a unit test asserts the printed config-file path is `~/.gemini/settings.json` on darwin/linux and `%APPDATA%\.gemini\settings.json` on win32 (mock `os.platform()`).

**Ad-hoc** (mandatory before marking done):

1. `just dev` against a fresh vault.
2. Walk through onboarding, identify vault as work-related, choose the Google path.
3. Confirm the agent prints the GCP enable + OAuth + `mcpServers` snippet + `/mcp auth` steps and explicitly tells the user "paste this into `~/.gemini/settings.json` yourself."
4. After "I've installed it and `/mcp list` shows Ready" confirmation, confirm `brainkit.toml` gains `[integrations.google_workspace] enabled = true` and **no** files under `~/.gemini/`, `~/.config/opencode/`, `~/.copilot/`, `~/.claude/` were modified by brainkit.
5. Restart the session; confirm the system prompt now hints at preferring Google Workspace MCP tools.
6. With the MCP servers actually loaded, ask the agent to enrich the vault; confirm contacts and project dirs appear from real tool output. Without the MCPs loaded, confirm graceful degradation.

## Notes

- Reference docs:
  - Configure Workspace MCP servers: <https://developers.google.com/workspace/guides/configure-mcp-servers>
  - Codelab: <https://codelabs.developers.google.com/google-workspace-mcp-gemini-cli>
  - Gmail MCP example: <https://developers.google.com/workspace/gmail/api/guides/configure-mcp-servers>
- Auth ceremony is heavier than M365's. The skill must let the user pick a subset of services (e.g. only Gmail + Calendar + People) — don't force enabling all five.
- For non-Gemini-CLI harnesses, the same MCP servers can be added via Claude Code's connectors UI or any MCP-capable client. The skill should mention these but defer to the user's harness — brainkit does not write any of those configs.
- Deferred / out of scope (push back if it creeps in):
  - Self-hosted variant with `gemini-cli-extensions/workspace` and a Cloud Function backend (the `jakubriegel/google-workspace-official-mcp-tutorial` flow) — useful but adds infra setup brainkit shouldn't be guiding users through.
  - Bulk import of Drive / Gmail content into the vault.
  - Per-vault Google account selection. Identity is per-machine (see `US-shared-vaults` Phase 0 if/when it lands), not per-vault.
- Decisions to confirm with the user during implementation:
  - Default scope set: read-only everywhere, or include `gmail.compose` so the agent can later draft replies? Prefer read-only by default; let the user opt up.
  - Whether to wire a separate `[integrations.google_workspace.services]` array (e.g. `["gmail","calendar","people"]`) so the prompt hint can be more specific. Optional polish, not required for DoD.
