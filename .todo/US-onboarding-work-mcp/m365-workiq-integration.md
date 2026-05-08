# m365-workiq-integration

## Context

Add an optional onboarding step that, when the user identifies their vault as work-related, offers to connect the agent to Microsoft 365 via the official **Microsoft Work IQ** MCP server (`@microsoft/workiq`). brainkit only suggests and guides — it does not write to the harness's MCP config and does not store credentials. If the user opts in, brainkit records `[integrations.m365] enabled = true` in `brainkit.toml` and prints the install + EULA + admin-consent steps. When the Work IQ MCP tools are present in the same session, the agent uses them to enrich onboarding (seed first contacts from `People.Read.All`, summarize recent meetings, name active workstreams).

**Value delivered**: A user whose work life lives in M365 can answer one question during onboarding and get a vault that's already populated with their org context — no manual contact entry, no "what are your projects" guesswork — while brainkit keeps its hands off the harness config.

## Related Files

- `skills/onboarding/SKILL.md` — add the work-MCP branch in Phase 2
- `skills/integrations/m365-workiq/SKILL.md` — **new**, provider-specific guidance
- `core/types.ts` — add `integrations.m365` to `BrainkitConfig`
- `core/vault.ts` — read/write the new config field (reuse existing TOML helpers)
- `core/prompt-sections.ts` — surface the marker in the system prompt when set
- `core/__tests__/vault.test.ts` (or equivalent) — config round-trip tests
- `core/__tests__/prompt-sections.test.ts` — prompt branch tests
- `docs/onboarding.md` — document the optional step
- `docs/features.md` — mention the integration

## Dependencies

- None. This task introduces the scaffolding (`[integrations.*]` schema, provider skill folder layout, onboarding branch) that the Google task will reuse.

## Acceptance Criteria

- [ ] `BrainkitConfig` in `core/types.ts` has an optional `integrations.m365.enabled: boolean` field; existing configs without this field still parse.
- [ ] `core/vault.ts` reads and writes `[integrations.m365] enabled = …` losslessly via `smol-toml`.
- [ ] `skills/integrations/m365-workiq/SKILL.md` exists and contains:
  - When to suggest (only during onboarding, only after user identifies vault as work-related, only as an optional opt-in question).
  - Exact install commands (npm global, npx one-shot, and `workiq accept-eula`).
  - Admin-consent guidance, including the "ask your tenant admin" fallback for non-admins (link to the Work IQ admin enablement guide).
  - The marker write: instruct the agent to set `[integrations.m365] enabled = true` in `brainkit.toml` only after the user confirms install/auth succeeded.
  - Enrichment recipes: how to call `ask_work_iq` to (a) list closest collaborators → seed contacts, (b) summarize recent meetings → seed `context`, (c) infer active projects → pre-create `01_projects/<name>/` dirs.
  - Graceful degradation: if `ask_work_iq` is not available in the session, remind the user how to finish setup and continue onboarding without enrichment. Never crash, never block.
- [ ] `skills/onboarding/SKILL.md` Phase 2 includes a clearly-marked optional sub-step: "If this is a work vault, ask once whether to connect M365 (Work IQ) or Google Workspace; on opt-in, defer to the corresponding integration skill." The question is skippable with no follow-up.
- [ ] `core/prompt-sections.ts` adds a one-liner to the system prompt when `integrations.m365.enabled === true`, telling the agent to prefer Work IQ MCP tools for M365 lookups when available.
- [ ] No file outside `~/.config/brainkit/` and the vault is written by brainkit during this flow. Verified by a launcher / vault-write test.
- [ ] No new runtime npm dependencies are added (`package.json` runtime deps unchanged besides `smol-toml`).
- [ ] `docs/onboarding.md` documents the new optional step and the M365 path end-to-end.
- [ ] `docs/features.md` references the integration.
- [ ] `just check` passes.

## Verification

**Automated** (preferred — confirm with user before adding):

- Unit test: parsing a `brainkit.toml` with and without `[integrations.m365]` round-trips correctly.
- Unit test: `buildSystemPrompt` (or the relevant section builder) includes the M365 hint iff `integrations.m365.enabled === true`.
- Unit test or snapshot: the strings/commands the agent is told to print (in the M365 skill) match the official Work IQ install instructions verbatim — so doc drift on Microsoft's side surfaces in CI.
- Existing onboarding tests still pass; a new test covers the Phase 2 branch when work vault + opt-in is asserted.

**Ad-hoc** (mandatory before marking done):

1. `just dev` against a fresh vault.
2. Walk through onboarding, identify vault as work-related.
3. Confirm the optional MCP question appears and is skippable.
4. Choose M365 / Work IQ path; confirm the agent prints the official install + EULA + consent commands.
5. After "I've installed it" confirmation, confirm `brainkit.toml` gains `[integrations.m365] enabled = true` and **no** files under `~/.config/opencode/`, `~/.copilot/`, `~/.claude/`, `~/.gemini/` were modified (`git status` on those dirs if tracked, or `find ~/.config/opencode -newer …` style check).
6. Restart the session; confirm the system prompt now hints at preferring Work IQ MCP tools.
7. With the actual Work IQ MCP loaded, ask the agent to enrich the vault; confirm contacts and project dirs appear from real tool output. Without the MCP loaded, confirm the agent degrades gracefully and continues.

## Notes

- Reference docs:
  - Work IQ overview: <https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/work-iq-cli>
  - Admin enablement: <https://github.com/microsoft/work-iq/blob/main/ADMIN-INSTRUCTIONS.md>
  - Plugin catalog: <https://github.com/microsoft/work-iq/blob/main/PLUGINS.md>
- The Work IQ MCP exposes `ask_work_iq`, `accept_eula`, `get_debug_link`. Onboarding enrichment uses `ask_work_iq` only.
- Admin consent is a real friction point — many users won't be tenant admins. The skill must handle this gracefully ("forward this link to your IT admin") rather than dead-ending the user.
- Decisions to confirm with the user during implementation:
  - Whether to bundle the M365 hint into `buildIdentity` or add a new `buildIntegrations` section. Prefer the latter if it stays under ~30 lines; otherwise inline.
  - Whether the onboarding skill should auto-suggest M365 vs Google based on email domain hints (e.g. user mentions an `@microsoft.com` or `@gmail.com` address). Defer unless trivially cheap.
- Out of scope (push back if it creeps in): writing to harness MCP configs, storing tokens, supporting non-official MCPs, building bulk-import flows, project-level integrations.
