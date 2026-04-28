# US-image-pasting

## Goal
Explore and design how users can paste images from their clipboard into the brainkit TUI / agent session, so visual context (screenshots, diagrams, photos) can flow into the vault without leaving the keyboard.

Scope is intentionally narrow: **clipboard paste into the brainkit TUI/agent only**. Drag-and-drop, file pickers, and broader "image input" mechanisms are out of scope for this US.

## Definition of Done
This is a brainstorming/discovery user story. It is done when:

- [ ] A design spec exists at `docs/superpowers/specs/YYYY-MM-DD-clipboard-image-pasting-design.md` covering:
  - The user-facing interaction (how does paste work, what feedback does the user get?)
  - Where pasted images land in the vault (path convention, naming, which PARA bucket if any)
  - How the agent references the image afterwards (markdown link? attached to a note? bragfile entry?)
  - Cross-platform constraints (macOS / Linux / Windows clipboard behavior in a terminal app)
  - OpenCode TUI plugin capability check — what is actually possible from `@opentui/solid` and the OpenCode plugin API?
- [ ] The spec has been reviewed and approved by the user
- [ ] A follow-up implementation plan or set of tasks has been created (either as new `.todo/US-*` work or appended here)

## Task Priority
No tasks yet — this US is a placeholder for a future brainstorming session. The first action when picking this up is to run the `brainstorming` skill against the goal above.

## Cross-Cutting Concerns
- **Harness config isolation** (see `AGENTS.md`): any solution must not modify the user's normal OpenCode config. Image storage and any new config must live under brainkit's owned dirs (`~/.config/brainkit/` or the vault).
- **Cross-platform**: clipboard image access differs significantly across macOS (`pngpaste`, AppleScript), Linux (`wl-paste`, `xclip`), and Windows (PowerShell). Investigate before committing to an approach.
- **Minimal dependencies**: prefer shelling out to OS tools or Node built-ins over adding an npm clipboard library. Adding a dep needs explicit user approval.
- **Vault boundary**: image files written to the vault must go through the same path-traversal protection as other vault writes (`core/vault.ts`).
- **Feature surface**: decide whether this is its own feature in `docs/features.md` or an enhancement to existing features (bragfile, meeting-notes).
