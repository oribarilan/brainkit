# Project Structure & Implementation

## Repository Structure

```
brainkit/
  src/
    index.ts                        # Entry point — CLI runner
    cli/
      tui.ts                        # TUI flow (onboarding + update)
      prompts.ts                    # Individual prompt components
      display.ts                    # Output formatting, summary screens
    config/
      config.ts                     # Config types, read/write brainkit.toml
      defaults.ts                   # Default config values, default rules
      version.ts                    # Version comparison, update checking
    features/
      registry.ts                   # Feature registry — all available features
      feature.ts                    # Feature type definition
      bragfile.ts                   # Bragfile feature definition
      contacts.ts                   # Contacts feature definition
      meeting-notes.ts              # Meeting notes feature definition
      self-review.ts                # Self-review feature definition
      vault-health.ts               # Vault health feature definition
    skills/
      installer.ts                  # Skill file installation/removal
    agents/
      generator.ts                  # AGENTS.md generation from config
      template.ts                   # AGENTS.md template
    providers/
      registry.ts                   # Provider registry
      provider.ts                   # Provider type definition
      agents-dir.ts                 # .agents/ provider
      claude.ts                     # .claude/ provider
      cursor.ts                     # .cursor/ provider
      opencode.ts                   # .opencode/ provider
      gemini.ts                     # .gemini/ provider
    gitignore/
      gitignore.ts                  # .gitignore creation/merging
    utils/
      fs.ts                         # File system helpers
      template.ts                   # Simple template rendering
  skills/                           # Source skill files (raw markdown)
    brainkit.md
    brainkit-config.md
    brainkit-add-brag.md
    brainkit-process-notes.md
    brainkit-query-contacts.md
    brainkit-review.md
    brainkit-doctor.md
  tests/
    config/
      config.test.ts
    features/
      registry.test.ts
    skills/
      installer.test.ts
    agents/
      generator.test.ts
    providers/
      registry.test.ts
    gitignore/
      gitignore.test.ts
  package.json
  tsconfig.json
  README.md
  LICENSE
  specs/                            # This specification directory
```

## Dependencies

| Package | Purpose |
|---|---|
| `@clack/prompts` | Interactive TUI prompts (modern, beautiful) |
| `smol-toml` | TOML parsing and serialization |
| `picocolors` | Terminal color output |

### Dev Dependencies

| Package | Purpose |
|---|---|
| `typescript` | Language |
| `tsup` or `tsx` | Build / dev execution |
| `vitest` | Testing |

## npm Package Configuration

```json
{
  "name": "brain-kit",
  "version": "1.0.0",
  "description": "Bootstrap and maintain your second brain as a GitHub repo",
  "bin": {
    "brainkit": "./dist/index.js"
  },
  "type": "module",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsx src/index.ts",
    "test": "vitest",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "second-brain",
    "knowledge-management",
    "markdown",
    "agent-skills",
    "para-method",
    "cli"
  ],
  "license": "MIT"
}
```

## Implementation Order

### Phase 1: Foundation
1. Project scaffolding (`npm init`, TypeScript config, directory structure)
2. Config module — types, read/write brainkit.toml, defaults
3. Feature registry — define all features with metadata
4. Skill templates — write the raw SKILL.md files
5. Write comprehensive tests alongside each module

### Phase 2: Core CLI
6. TUI flow — onboarding mode (first run)
7. TUI flow — update mode (subsequent runs)
8. Prompt components — feature selection, personalization, provider selection

### Phase 3: Installation
9. Skill installer — copy skill files to provider directories (including /doctor and /config)
10. AGENTS.md generator — render from config + features
11. .gitignore creator — create/merge .gitignore
12. Provider support — .agents/, .claude/, .cursor/, etc.

### Phase 4: Polish
13. Version checking — compare with npm registry
14. Error handling — all edge cases
15. README and documentation
16. npm publishing setup

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Single command | `brainkit` (no subcommands) | Simplicity. One TUI handles everything. |
| Config format | TOML | Clean, readable, standard for config files |
| TUI library | @clack/prompts | Modern, beautiful, good DX (the "huh" of Node.js) |
| Skill format | Agent Skills spec (SKILL.md) | Interoperability across providers |
| Primary provider | `.agents/` | Cross-provider standard |
| No vault content creation | CLI never creates vault files | Safety. Agent handles migration via /doctor. |
| PARA mandatory | Always enabled | Core organizational model, eliminates dual-path complexity |
| Template approach | TypeScript builder | No template engine dependency, easier to test |
| Skill source | Top-level `skills/` directory | Easy to edit and review as standalone markdown |
| Skill templates as files | Raw .md files in top-level `skills/` | Easy to edit, review, version |
| ESM | `"type": "module"` | Modern Node.js standard |
