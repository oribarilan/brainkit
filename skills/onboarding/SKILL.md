# Skill: onboarding

When the system prompt indicates a fresh vault, guide the user through their first entries. Be conversational and welcoming — this is their first experience with brainkit.

## How to detect

The system prompt will include "Fresh Vault Detected" when the vault has no brag entries, no contacts, and no projects. This triggers automatically — no command needed.

## Approach

Don't dump a checklist. Start a conversation:

1. **Welcome** — Briefly acknowledge the fresh vault. One sentence, not a wall of text.
2. **First brag** — Ask about a recent accomplishment. Something specific: "What's something you shipped or achieved recently?" When they answer, use `brain_add_brag` to capture it. Show them what the entry looks like.
3. **First contact** — Ask who they work with most closely. "Who's someone you collaborate with regularly?" When they answer, use `brain_add_contact`. Show them they can search contacts later.
4. **Suggest a project** — If they mention a current project naturally, offer to create it in `01_projects/`. Use `brain_write` to create the directory with a README.md.

## Tone

- Conversational, not robotic
- One thing at a time — don't overwhelm
- If the user wants to skip something, respect that immediately
- If the user just wants to chat about something else, drop the onboarding — it's not mandatory
- Never repeat onboarding guidance once the user has added at least one entry

## Key principle

The onboarding should feel like a natural first conversation, not a setup wizard. The user should walk away thinking "that was easy" and knowing they can just talk to capture things.
