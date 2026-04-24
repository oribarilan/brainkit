# Onboarding

Onboarding is the guided first-run experience that turns an empty vault into something personal. When the system prompt detects a fresh vault, it injects a "Fresh Vault Detected" section, and the agent walks the user through a getting-to-know-you conversation — collecting information about their work, personal life, and preferences, then setting up the vault structure to match.

## Behavior

### Fresh vault detection

A vault is considered fresh when all of these are true:

- The bragfile is empty or contains only the `# Bragfile` heading (checked only if `features.bragfile` is enabled)
- The contacts file is empty or contains only the `# Contacts` heading (checked only if `features.contacts` is enabled)
- No project directories exist inside `01_projects/` (files are ignored; only subdirectories count)
- `onboarding_complete` is not `true` under `[user.customization]` in `brainkit.toml`

The `isVaultFresh()` function in `core/vault.ts` handles the first three checks. The `buildOnboarding()` function in `core/prompt-sections.ts` checks `onboarding_complete` first — if it's true, the onboarding section is never injected, regardless of vault contents. This means a user can reset their vault's files without retriggering onboarding.

When a vault is fresh, the system prompt includes:

```
## Fresh Vault Detected

This vault was just set up and has no content yet.
Guide the user through their first entries using the onboarding skill.
Be conversational and welcoming, not a checklist.
```

### Conversational flow

Onboarding is a conversation, not a form. The agent asks one topic at a time, adapts based on what the user shares, and doesn't force every question. If the user volunteers information early, the agent uses it and moves on. Five phases, in order:

**Phase 1 — basics.** Name, professional role or title, and main areas of expertise. These map directly to `brainkit.toml` fields.

**Phase 2 — professional life.** Current projects (what they're actively working on), team structure and org context, closest collaborators (potential first contacts), and work rhythm (meetings, async communication, schedule patterns).

**Phase 3 — personal life.** The agent transitions naturally: "Now let's set up the personal side too." This covers family or living situation, ongoing personal projects (renovations, learning goals, training), main personal responsibilities (health, finances, children's activities, home maintenance), and hobbies or interests worth tracking notes on.

**Phase 4 — preferences.** Communication tone (direct, casual, technical, concise) and any standing rules the user wants the agent to always follow.

**Phase 5 — setup.** Based on everything discussed, the agent does all of the following:

- Writes `brainkit.toml` at the vault root with name, role, expertise, tone, scope (set to `"both"` since onboarding covers personal and professional), enabled features, and any custom rules mentioned. The config includes a rich `context` field that summarizes everything learned in prose — work situation, team context, personal life, interests, responsibilities.
- Creates the PARA directory structure (the four directories, each with a `README.md`).
- Pre-creates directories based on the conversation: professional projects go into `01_projects/` with a `README.md`, personal areas (health, finances, etc.) go into `02_areas/`, personal projects also go into `01_projects/`, and interests go into `03_resources/`. Each gets a `README.md`.
- If the user mentioned a recent accomplishment, offers to add it as the first brag entry.
- If the user mentioned colleagues by name, offers to add them as the first contacts.
- Runs a GitHub repo privacy check. If the vault repo is public, warns the user immediately and suggests `gh repo edit owner/repo --visibility private`.

The agent summarizes what was set up at the end: directories created, config fields populated, entries added.

### Profile nudge

If onboarding wasn't completed — `onboarding_complete` is not true — and certain profile fields are empty, the system prompt includes a gentle nudge. The `buildProfileNudge()` function checks for:

- Empty `expertise` array
- Missing or empty `work.description`
- Missing or empty `personal.description` (only checked when scope is `"personal"` or `"both"`)

When any of these are empty, the system prompt gets a "Profile Incomplete" section listing the missing fields. The agent is instructed to fill them in when it comes up naturally in conversation — not to lead with it or make it the first thing it says. The nudge disappears once `onboarding_complete` is set to true, even if some fields remain empty. The user's choice to leave things blank is respected.

### Completion

When the user is satisfied with their profile, the agent sets `onboarding_complete = true` under `[user.customization]` in `brainkit.toml`. This permanently suppresses both the "Fresh Vault Detected" section and the profile nudge. There's no way to retrigger onboarding from the system prompt after this — the user would need to manually remove or change the flag in their config.

### Tone and boundaries

The agent is warm but efficient. Not overly chatty, not robotic. It asks one topic at a time and doesn't dump all questions at once. If the user wants to skip personal information, the agent respects that immediately — no pushing, no "are you sure?" The scope can be set to `"professional"` and personal fields left empty.

## Harness implementation

| Capability | OpenCode | Copilot CLI |
|---|---|---|
| Fresh vault detection | `buildOnboarding()` in `core/prompt-sections.ts` checks `onboarding_complete` and calls `isVaultFresh()`; injects "Fresh Vault Detected" into the system prompt via the `experimental.chat.system.transform` hook in `opencode/server.ts` | Static in AGENTS.md — "Fresh Vault Detected" is included if vault is fresh at launch; not removed mid-session after onboarding completes |
| Conversational flow | Agent follows the onboarding skill instructions; the entire flow is conversation-driven with no typed tools or structured UI | Same — agent follows onboarding skill from `.agents/skills/brainkit/references/onboarding.md` |
| Config writing | Agent writes `brainkit.toml` using built-in file tools; the config structure follows the format defined in `core/types.ts` | Same — agent writes config using built-in tools |
| Directory creation | Agent creates PARA directories and project/area/resource subdirectories using built-in file tools | Same — agent creates directories using built-in tools |
| Profile nudge | `buildProfileNudge()` in `core/prompt-sections.ts` checks for empty expertise, work description, and personal description; injects "Profile Incomplete" into the system prompt when fields are missing | Static in AGENTS.md at launch; not updated when fields are filled mid-session |
| Completion tracking | Agent sets `onboarding_complete = true` under `[user.customization]` in `brainkit.toml` when the user is satisfied with their profile | Same — agent sets the flag in config |
