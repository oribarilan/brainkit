# TUI

The TUI is brainkit's custom terminal interface layer for OpenCode. It replaces the default home screen with brainkit branding, adds a sidebar showing vault stats, and swaps in brainkit-specific tips. This is an OpenCode-only feature — it depends on OpenCode's plugin slot system (`home_logo`, `home_prompt`, `home_bottom`, `sidebar_content`) and has no equivalent in other harnesses. The functional information it surfaces (brag stats, doctor command) is available through other means (system prompt, skills), so nothing is lost in harnesses that lack a TUI plugin API.

## Behavior

### Home screen branding

The `home_logo` slot replaces OpenCode's default logo with an ASCII art brain rendered in the theme's primary color (rose, `#E8A0BF`). The art is stored in `opencode/logo.ts` as an array of strings — one per line — and rendered by mapping each line to a `<text>` element with the primary color applied.

The `home_prompt` slot replaces the default input prompt with a brainkit-customized version. It shows "brainkit" as a hint label in the primary color, and cycles through vault-related placeholder suggestions to give new users a sense of what they can ask. The placeholders come in two sets:

Normal mode suggestions include things like "Tell me about your day...", "What did you accomplish this week?", "Add a brag entry for shipping the new API", and "Search my vault for meeting notes with Sarah". Shell mode suggestions show example commands like `grep -r 'action item' ~/second-brain/01_projects/` and `cat ~/second-brain/02_areas/career/bragfile.md`.

The prompt slot also preserves the `home_prompt_right` slot from the original OpenCode UI, so other plugins can still inject content on the right side of the prompt.

### Vault stats sidebar

The `sidebar_content` slot renders a Sidebar component that reads vault state on every render using `createMemo`. It calls `readGlobalConfig()` to find the vault path, then `readVaultConfigSimple()` to get user info and feature flags. If either call fails or returns null, the sidebar shows "No vault configured" in muted text.

When a vault is available, the sidebar shows:

The user's name and vault path, with the name in the primary color and the path in muted text. Below that, if the bragfile feature is enabled, it shows the total brag entry count and the date of the last entry. The last-entry date is color-coded by staleness: green (`#50E850`) for 7 days or fewer, yellow (`#E8E850`) for 8–14 days, and red (`#E85050`) for more than 14 days or if no entry has ever been recorded. If the contacts feature is enabled, it shows a contact count pulled from `readContacts()` and `parseContacts()`.

Feature flags from `brainkit.toml` control what appears. If `features.bragfile` is `false`, brag stats are hidden. If `features.contacts` is `false`, the contact count is hidden. Both default to `true` when not specified.

### Rotating tips

The `home_bottom` slot renders a Tips component that replaces OpenCode's built-in home tips. On plugin activation, the TUI deactivates the `internal:home-tips` plugin so the two tip systems don't stack. On plugin dispose (cleanup), it reactivates `internal:home-tips` so the default behavior returns if brainkit is unloaded.

Tips rotate every 8 seconds via `setInterval`. The initial tip is randomly selected, and subsequent tips cycle through the list sequentially, wrapping around. Each tip displays as a yellow bullet (`●`) followed by the tip text in muted color.

The tip list:

- `/doctor to check vault health`
- `mention an accomplishment and I'll offer to capture it`
- `I can create meeting notes from any conversation`
- `ask me about your vault stats`
- `I can search your vault for anything`
- `I organize using the PARA method`
- `I'll remind you if your bragfile gets stale`
- `@ a vault file to add it as context`

### Color theme

The plugin ships a `brainkit.json` theme file that it installs and activates on load. The theme uses a rose/pink palette built around `#E8A0BF` as the primary color, with a dark background (`#1a1a2e`). The theme defines custom colors for everything OpenCode can style: text, borders, diffs, markdown rendering, syntax highlighting.

Key color definitions:

- Primary: `#E8A0BF` (rose)
- Background: `#1a1a2e` (dark navy-purple)
- Text: `#E8E0E8` (light lavender)
- Muted text: `#8A7090` (dusty purple)
- Success/error/warning use standard green/red/yellow tones

The theme is installed via `api.theme.install()` pointing to the JSON file, then set as active with `api.theme.set("brainkit")`. Both dark and light variants map to the same colors — the theme is dark-only in practice.

### Slash commands

The TUI registers a `/doctor` slash command via `api.command.register()`. When selected, it submits the text "Run vault health checks using /doctor and report the results." to the chat. This triggers the agent to run the vault health check system and report back. The command appears in the command palette under the "Brainkit" category.

## Harness implementation

| Capability          | OpenCode                                                                                                                                                      | Copilot CLI                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Home branding       | `home_logo` slot renders ASCII art brain; `home_prompt` slot customizes the input prompt with "brainkit" hint label and vault-related placeholder suggestions | Not available — Copilot CLI owns its UI; no plugin slots for visual elements                                       |
| Vault stats sidebar | `sidebar_content` slot renders the Sidebar component with vault name, brag stats (count + staleness color), and contact count                                 | `statusLine` script prints a one-liner with vault name, brag stats, and contact count in Copilot's footer bar      |
| Rotating tips       | `home_bottom` slot renders Tips component; built-in tips deactivated via `api.plugins.deactivate("internal:home-tips")` and restored on dispose               | `companyAnnouncements` in `~/.config/brainkit/copilot/settings.json` — one random tip shown at startup; no cycling |
| Color theme         | Theme installed from `brainkit.json` via `api.theme.install()` and set as active with `api.theme.set("brainkit")`                                             | Not available — Copilot CLI only supports preset themes (dark/light/auto)                                          |
| Slash commands      | `/doctor` registered via `api.command.register()`, submits health check request to chat                                                                       | Not needed — user asks "check my vault health" directly; the maintenance skill guides the agent                    |

The TUI is inherently harness-specific. Other harnesses (Claude Code, Copilot CLI, etc.) run in their own terminal environments and don't have plugin slot systems. There's nothing in the TUI that needs replication — the vault stats it shows are available through the system prompt, the tips are covered by skills, and health checks are triggered through the agent's tool system.
