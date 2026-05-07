# US-onboarding-work-mcp

## Goal

Make brainkit onboarding optionally connect to the user's work productivity stack via existing official MCP servers — **Microsoft Work IQ** for M365 / Copilot users and the **Google Workspace MCP servers** for Google Workspace users — so that work-vault onboarding can be enriched with real org/people/meeting context the user already has access to, instead of relying solely on a Q&A.

The end state: during onboarding, when the user indicates this is a work vault, the agent offers an optional step: "Want me to pull work context from Microsoft 365 or Google Workspace?" If the user opts in, the agent guides them through installing and authenticating the appropriate MCP server (Work IQ or Google Workspace MCP), records the choice in `brainkit.toml`, and — if the MCP becomes available in the same session — uses its tools to seed contacts, project areas, and an initial work-rhythm summary in the vault. If the user declines or skips, onboarding proceeds exactly as today.

The mechanism is **suggest + guide**, not auto-install. brainkit must not write to the harness's MCP/config dirs (harness config isolation, see `AGENTS.md`). brainkit only:

1. Asks during onboarding (gated on opt-in for work-related vaults).
2. Prints copy-paste install/auth commands for the chosen provider.
3. Writes a small marker in `brainkit.toml` recording the user's choice.
4. Loads a provider skill that teaches the agent how to use the MCP tools to enrich the vault, _if_ those tools are present in the session.

## Definition of Done

The user story is done when **both tasks below have shipped**, and:

- [ ] During onboarding, when the user identifies the vault as work-related, the agent asks an optional, skippable question about connecting to M365 or Google Workspace.
- [ ] If the user opts in to **Microsoft Work IQ**, the agent prints the official install + EULA + admin-consent steps from `npm i -g @microsoft/workiq` / `npx -y @microsoft/workiq mcp` and records `[integrations.m365] enabled = true` in `brainkit.toml`.
- [ ] If the user opts in to **Google Workspace MCP**, the agent prints the official `~/.gemini/settings.json` (or harness-equivalent) MCP server configuration plus the `gcloud services enable …mcp.googleapis.com` and `/mcp auth …` steps, and records `[integrations.google_workspace] enabled = true` in `brainkit.toml`.
- [ ] If the user declines or skips, no marker is written and onboarding proceeds unchanged.
- [ ] When the marker is set **and** the corresponding MCP tools are available in the session, the agent uses them to enrich the vault during onboarding setup (e.g. seed `02_areas/team/` from org data, pre-populate first contacts, add a work-rhythm note to `context`). When the marker is set but tools are absent, the agent reminds the user how to finish installation and continues onboarding without enrichment.
- [ ] brainkit makes **no writes** outside `~/.config/brainkit/` and the user's vault. The harness's MCP config is never touched. (Verified by inspecting changed files in launcher tests.)
- [ ] No new runtime npm dependencies are added to brainkit itself.
- [ ] `docs/onboarding.md` documents the new optional step and the per-provider behavior.
- [ ] `docs/features.md` lists the new integration capability under Onboarding (or as its own bullet, agent's call).
- [ ] `core/types.ts` has typed support for the new `[integrations.*]` config sections.
- [ ] All checks pass: `just check`.

## Task Priority

The two tasks are independent — either can ship first — but the user has more M365 exposure today, so:

1. **`m365-workiq-integration.md`** — first. Higher likelihood of real-world use; Work IQ is a single npm package with a well-defined CLI and MCP mode, lower setup ceremony than Google Workspace OAuth.
2. **`google-workspace-mcp-integration.md`** — second. Google Workspace MCP requires per-product OAuth client setup in GCP, so the install guidance is longer and more error-prone; benefits from patterns established by the M365 task.

Both tasks share the same scaffolding (onboarding branch, `[integrations.*]` config schema, provider skill loader), so the second task should reuse — not re-invent — what the first task introduces.

## Cross-Cutting Concerns

### Architectural decisions (locked in)

- **Suggest + guide, never auto-install.** brainkit must not write to the harness's MCP config or to `~/.claude/`, `~/.copilot/`, `~/.config/opencode/`, `~/.gemini/`, etc. It only prints commands and writes its own `brainkit.toml` marker. This preserves the harness config isolation rule from `AGENTS.md`.
- **Optional and skippable.** The work-MCP step is gated on the user identifying the vault as work-related during Phase 2 of onboarding. If they don't, the question never appears. If they do, "skip" must be a first-class answer with no nagging.
- **One provider per vault, by default.** Most users live in either M365 or Google Workspace. The agent asks which (or "neither/skip"). Recording both is allowed but not encouraged in the prompt — keep the decision tree narrow.
- **Marker, not credentials.** brainkit never stores tokens, OAuth secrets, or tenant IDs. The MCP server owns auth. The marker only records "user opted in" so future sessions can detect the integration.
- **Tools may be absent.** Even when the marker is set, the MCP tools may not be loaded in the current session (different harness, user reverted config, auth expired). The agent must degrade gracefully — never assume tools exist; check first.
- **No new runtime deps.** Use existing `smol-toml` for the new config keys. No HTTP clients, no MCP client libraries — brainkit talks to MCPs only via whatever the harness exposes; brainkit itself does not call MCP servers directly.
- **Cross-platform.** All printed commands must work on Win/Mac/Linux, or the agent must branch on `os.platform()` when generating them.

### Non-goals (refuse scope creep)

- Building brainkit's own M365 or Google Workspace MCP server.
- Storing OAuth tokens, tenant IDs, client secrets, or any credential material in `brainkit.toml` or anywhere under `~/.config/brainkit/`.
- Auto-editing the user's `~/.gemini/settings.json`, `~/.copilot/`, VS Code MCP config, Claude config, or any other harness/IDE config.
- Building a vault sync or "import everything from M365" bulk flow. Onboarding enrichment is small and targeted (org tree → first contacts, recent projects → first project dirs, work rhythm → context summary).
- Per-vault credentials. brainkit doesn't manage auth at all.
- Detecting whether the MCP is _already_ installed in the harness — too brittle across harnesses. Just ask.
- Supporting non-official / community MCP servers (e.g. third-party Outlook MCPs). Only Microsoft Work IQ and Google's official Workspace MCP servers.

### Constraints carried from `AGENTS.md`

- Cross-platform paths via `os.homedir()` + `path.join`.
- No new runtime dependencies without explicit user approval.
- Harness config isolation: brainkit only writes under `~/.config/brainkit/` and the vault.
- Path traversal protection on any new vault file operations.
- Single-responsibility files: provider-specific guidance lives in provider-specific skills, not jammed into the onboarding skill.

### Skills affected

- **New:** `skills/integrations/m365-workiq/SKILL.md` — when to suggest, exact install/EULA/consent commands, how to use `ask_work_iq` MCP tool to enrich onboarding (org, contacts, recent meetings), how to degrade when the tool isn't loaded.
- **New:** `skills/integrations/google-workspace/SKILL.md` — same shape for Google: GCP project + OAuth client + per-service `gcloud services enable`, `~/.gemini/settings.json` snippet, `/mcp auth` walkthrough, enrichment using `gmail`/`calendar`/`people`/`drive` tools, graceful degradation.
- **Modified:** `skills/onboarding/SKILL.md` — Phase 2 gains a sub-step: "If this is a work vault, offer the optional MCP integration question. Branch to the appropriate provider skill if the user opts in."

### Config schema additions (`core/types.ts`)

Add an optional `integrations` object to `BrainkitConfig`:

```ts
integrations?: {
  m365?: { enabled: boolean }
  google_workspace?: { enabled: boolean }
}
```

Both fields are opt-in; absence means "not configured / never asked." The agent uses absence to decide whether to ask again on a fresh vault.

### System prompt sections affected

- `core/prompt-sections.ts`:
  - `buildOnboarding` — when fresh vault detected, mention the optional work-MCP step is available so the agent surfaces it during Phase 2.
  - New helper (or inline in `buildIdentity`) — when `integrations.m365.enabled` or `integrations.google_workspace.enabled` is true, append a one-liner instructing the agent to prefer the corresponding MCP tools for work-context lookups when available.

### Validation

- Unit tests for the new config schema (parse, round-trip, defaults).
- Unit tests for the new prompt-section branches (marker present/absent × tools present/absent — but the "tools present" check is agent-side and not unit-tested in core).
- Snapshot or golden-file test for the printed install commands per provider per OS (so future doc drift breaks tests).
- Manual verification: run `just dev`, walk through onboarding for a work vault, confirm the question appears, confirm "skip" works, confirm opt-in writes the marker and prints commands without touching any harness config.
