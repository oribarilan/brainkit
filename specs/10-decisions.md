# Design Decisions Log

This document records all key decisions made during the design of brainkit, with context and rationale.

## 1. Skill distribution system, not a persistent CLI

**Decision:** Brainkit is primarily a skill distribution system. The CLI installs agent skills into a vault, not a tool the user runs for daily operations.

**Rationale:** The original spec had thin CLI commands (init, create, new, sync) that were essentially shell script wrappers. The real value is the agent skills and conventions, not the CLI commands. Following the impeccable model makes this explicit.

**Alternatives considered:**
- Full CLI tool with many commands (too much surface area, most operations are better done by agents)
- One-shot scaffolder with no re-run capability (too limiting, no progressive adoption)

## 2. Progressive feature adoption with re-run model

**Decision:** Users can run brainkit multiple times to adopt new features incrementally. The TUI shows what's enabled, what's new, and lets users toggle features.

**Rationale:** Second brain systems fail when they're too complex on day one. Users should start with one concept (e.g., just PARA) and add more as the habit forms (bragfile, contacts, etc.). This also enables brainkit to ship new features that existing users can adopt.

## 3. npm distribution over Go binary

**Decision:** TypeScript npm package, not a compiled Go binary.

**Rationale:** Cross-platform distribution with zero infrastructure. `npm i -g brainkit` works everywhere. Built-in version checking via npm. Go would require goreleaser, Homebrew tap setup, and separate Windows distribution — more infrastructure for no meaningful benefit (this isn't a performance-critical tool).

## 4. brainkit never touches vault content

**Decision:** The CLI only installs skill files, generates AGENTS.md, and writes brainkit.toml/.gitignore. It never creates vault content (markdown notes, PARA directories, bragfile, contacts).

**Rationale:** Safety. If a user runs brainkit in a vault that already has content, we don't want the CLI to accidentally move or overwrite their files. The agent, guided by the `/doctor` skill, handles vault structure creation with human-in-the-loop confirmation.

## 5. Single `brainkit` command, no subcommands

**Decision:** One command that runs an interactive TUI. No `brainkit init`, `brainkit add`, etc.

**Rationale:** Simplicity. The TUI handles both first-run (onboarding) and subsequent runs (feature management) via the same flow. There's no cognitive load of remembering subcommands. The TUI is the product.

## 6. TOML for config, not YAML or JSON

**Decision:** `brainkit.toml` over `brainkit.yaml` or `brainkit.json`.

**Rationale:** TOML is purpose-built for configuration files. It's cleaner than YAML (no gotchas with implicit typing, no significant whitespace) and more readable than JSON (supports comments, no trailing comma issues). It's the standard in the Rust/Go ecosystem for config and increasingly adopted elsewhere.

## 7. Contacts as list format, not table

**Decision:** Each contact is an H2 section with bullet point fields, not a markdown table row.

**Rationale:** Markdown tables break down past ~15 rows: hard to edit, terrible diffs, column widths distort. List format is more readable, diffable, grep-friendly, and agent-friendly. Scaling to 50+ contacts is comfortable in list format.

## 8. `sync` command removed

**Decision:** No git sync command. Users manage their own git workflow.

**Rationale:** `git add -A && git commit && git push` is dangerous without pull/rebase, .gitignore, and conflict handling. Doing it properly is complex; doing it naively is a data-loss footgun. Users who want sync can alias it themselves or use their preferred git workflow. Brainkit should not own this.

## 9. `doctor` as agent skill, not CLI command

**Decision:** Vault health checking is an agent skill (`/doctor`), not a brainkit CLI command.

**Rationale:** The agent can perform richer health checks than a CLI tool — it can understand content, assess consistency of conventions, and provide contextual suggestions. CLI-based validation would be limited to structural checks (file exists, config parses). The agent can do all of that AND content-aware checks.

## 10. Multi-provider support from day one

**Decision:** Generate skill files for multiple AI agent providers, not just one.

**Rationale:** Users shouldn't be locked into a specific AI agent. The `.agents/` directory is the emerging standard, but Claude Code, Cursor, and others still have their own skill directories. Generating for multiple providers ensures the vault works regardless of which agent the user runs. Following the impeccable pattern.

## 11. Agent Skills spec for skill files

**Decision:** Use the [Agent Skills specification](https://agentskills.io/specification) with YAML frontmatter in SKILL.md files.

**Rationale:** Interoperability. The Agent Skills spec is becoming the standard across providers. Using it means brainkit skills can be discovered and loaded by any agent that supports the spec, without brainkit-specific integration.

## 12. `.agents/` as primary skill directory

**Decision:** `.agents/skills/` is the primary (always-generated) skill directory. Other provider dirs are secondary.

**Rationale:** `.agents/` is the most standardized cross-provider directory. VS Code Copilot, and increasingly other tools, use it. It's the "biggest common denominator" as the user described.

## 13. .gitignore is directly created by CLI (exception to "no vault content" rule)

**Decision:** .gitignore is the one file brainkit creates directly (not via agent), even though other vault content is agent-managed.

**Rationale:** .gitignore must exist before the user makes their first commit. It's always safe (additive, never destructive), universally needed, and has no content-dependent logic. Waiting for the agent to create it would risk committing .DS_Store and editor files on the first push.

## 14. PARA is mandatory, not a toggleable feature

**Decision:** PARA structure is always enabled. It's the organizational backbone, not an optional feature. Fixed 4 categories (Projects, Areas, Resources, Archive) with standard paths. No customization in v1.

**Rationale:** Making PARA optional introduced dual-path complexity everywhere: bragfile/contacts needed conditional paths, skills needed conditional logic, AGENTS.md needed conditional sections, and tests needed to cover both modes. PARA is core to the second brain concept — a user who doesn't want PARA probably doesn't want brainkit. The tool is explicitly opinionated, and PARA is the opinion. Removing the toggle eliminated ~30% of conditional logic.

## 15. /setup merged into /doctor

**Decision:** The /setup skill is merged into /doctor. /doctor handles both initial vault setup (creating PARA dirs, bragfile, contacts) and ongoing health checks/maintenance.

**Rationale:** /setup and /doctor had significant overlap — both inspect brainkit.toml and compare against vault state. /doctor is the natural place for "align vault with config" logic, whether it's first-time creation or ongoing maintenance. One skill, one mental model.

## 16. /config skill for agent-driven configuration

**Decision:** A new `/config` skill allows the agent to interactively configure the vault (features, personalization, rules) by editing brainkit.toml and patching AGENTS.md in-place.

**Rationale:** After initial CLI onboarding, subsequent config changes should be agent-driven. The user says "add a rule that I always use bullet points" and the agent edits brainkit.toml and updates AGENTS.md. No need to re-run the CLI for minor config changes. The CLI remains the authoritative AGENTS.md generator — re-running it is a "hard reset" that guarantees consistency. /doctor verifies AGENTS.md matches config.

## 17. Custom user rules in brainkit.toml

**Decision:** Custom behavioral rules are stored as a `rules` array under `[user]` in brainkit.toml. They're rendered into AGENTS.md's "How to Interact" section. The agent can edit this array via /config.

**Rationale:** Users need a way to add persistent rules ("always use bullet points", "mention attendees in meeting summaries"). brainkit.toml is the single source of truth — rules flow into AGENTS.md during generation. The /config skill lets the agent manage rules without the user hand-editing TOML.

## 18. Agent patches AGENTS.md in-place after /config

**Decision:** After /config edits brainkit.toml, the agent also patches AGENTS.md in-place (targeted section edits). The CLI remains the authoritative full-rebuild generator.

**Rationale:** Requiring a CLI re-run after every /config change is friction. The agent can make targeted edits (add a rule bullet, update user name) without needing the full template. If AGENTS.md drifts from config, /doctor detects it and suggests re-running `brainkit` CLI. This gives immediate effect with a safety net.

## 19. TypeScript builder for AGENTS.md, not a template engine

**Decision:** AGENTS.md is generated by TypeScript code (conditional string building), not a template engine like Handlebars.

**Rationale:** The template uses conditionals and loops that look like Handlebars syntax in the spec, but implementing them as TypeScript code is simpler, has no extra dependency, and is easier to test. The spec's template notation is illustrative, not prescriptive.

## 20. Skill source files in top-level skills/ directory

**Decision:** Raw skill markdown files live in the top-level `skills/` directory, not in `src/skills/templates/`.

**Rationale:** Keeping skills as standalone .md files at the top level makes them easy to edit, review, and diff. They're imported/read during the build process. No duplication between src/ and top-level.

## 21. Feature disable archives content, never deletes

**Decision:** When a feature is disabled, /doctor offers to archive related vault content (e.g., move bragfile to 04_archive/). It never deletes files.

**Rationale:** Consistent with the vault's "never delete, always archive" philosophy. Users might re-enable features later or want to reference old content. The archive is the safe destination for everything that's no longer active.

## 22. Full test coverage for v1

**Decision:** Ship v1 with comprehensive test coverage using vitest. Test config parsing, AGENTS.md generation, skill installation, feature registry, and provider generation.

**Rationale:** This is a tool that manages user content and configuration. Bugs in config parsing or AGENTS.md generation would break the user's agent experience silently. Full test coverage catches regressions as features are added.
