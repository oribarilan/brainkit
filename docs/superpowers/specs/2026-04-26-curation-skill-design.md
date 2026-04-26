# Onboarding Fast-Path & Vault Curation Skill

## Overview

Three related improvements to brainkit's content guidance:

1. **Onboarding fast-path** — after collecting basics, offer a choice to invest 3-5 more minutes or skip
2. **Curation skill** — new skill teaching the agent to detect config-relevant changes in conversation and suggest updates to brainkit.toml, contacts, and bragfile
3. **Health-check rename** — rename the existing maintenance skill to "health-check" to distinguish structural health from content curation

## 1. Onboarding Fast-Path

**File:** `core/onboarding-prompt.ts`

After step 3 (basics: name, role, expertise), insert a decision point using the question tool:

- **"Invest 3-5 more minutes to flesh out your vault (recommended)"** → continues to context + preferences steps
- **"Skip for now"** → creates files immediately with what we have. Agent tells the user they can enrich their vault anytime by chatting or editing `brainkit.toml` directly.

The "skip" path still creates all structural files (PARA dirs, bragfile, contacts) — it just uses minimal/empty context fields in `brainkit.toml`.

## 2. Curation Skill

**File:** `skills/curation/SKILL.md` (new)

A skill that teaches the agent to passively detect when conversations reveal information that should update the vault's core knowledge. Two categories:

### Config fields (`brainkit.toml`)

| Field | Trigger examples |
|-------|-----------------|
| `user.role` | "I got promoted to senior engineer", "I switched to the platform team" |
| `user.expertise` | "I've been doing a lot of Rust lately", "I'm learning Kubernetes" |
| `user.work.description` | "We reorganized, I'm now on the infra team", "started a new project" |
| `user.personal.description` | "We just moved to Austin", "had a baby" (personal vaults only) |
| `user.customization.context` | Any significant change to the user's overall context |

### Vault content

| Target | Trigger examples |
|--------|-----------------|
| `contacts.md` | "My new manager is Sarah", "had a meeting with the CTO" |
| `bragfile.md` | "I shipped the migration", "got great feedback from the VP" |

### Behavior

- Always *suggest*, never auto-update. Use the question tool to ask: "Sounds like your role changed — want me to update your config?"
- Don't interrupt the user's current task. Note the opportunity and suggest at a natural pause.
- If the user declines, don't ask again for the same information.
- For config updates: read the current `brainkit.toml`, show the proposed change, ask for confirmation.
- For vault content: follow the existing bragfile and contacts skill conventions.

### Skill description (for auto-invocation)

> Keep vault knowledge fresh. Detect when conversations reveal changes to the user's role, expertise, team, projects, or contacts, and suggest updating brainkit.toml or vault content.

## 3. Health-Check Rename

**File:** `skills/maintenance/SKILL.md` (modify)

- Rename heading from "Vault Maintenance" to "Vault Health Check"
- Update description from "Vault health, naming conventions, staleness detection, archive workflow" to "Structural health checks — PARA structure, naming conventions, staleness detection, archive workflow"
- Keep all content the same

**File:** `cli/install-skills.ts` (modify)

- Update label from `"Maintenance"` to `"Health Check"`

## Changes Summary

| File | Action | Type |
|------|--------|------|
| `core/onboarding-prompt.ts` | Modify | Prompt text |
| `skills/curation/SKILL.md` | Create | Skill markdown |
| `skills/maintenance/SKILL.md` | Modify | Heading + description |
| `cli/install-skills.ts` | Modify | Label string |

No code logic changes. No new tests needed (skill files are markdown, onboarding prompt tests already cover structure).
