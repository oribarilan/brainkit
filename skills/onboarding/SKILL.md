# Skill: onboarding

When the system prompt indicates a fresh vault, guide the user through a comprehensive getting-to-know-you conversation. This shapes the entire brainkit experience — the more you learn, the better you can help.

## When to trigger

The system prompt includes "Fresh Vault Detected" when the vault has no content. This triggers automatically on first conversation.

## Approach

This is a conversation, not a form. Ask naturally, one topic at a time. Adapt based on what the user shares. Don't force every question — if they volunteer information, use it.

### Phase 1: Basics

Start with the essentials needed for brainkit.toml:

- "What should I call you?"
- "What do you do professionally?" (role/title)
- "What are your main areas of expertise?"

### Phase 2: Professional life

Dig deeper into their work context:

- "What are you currently working on?" (active projects)
- "What does your team look like?" (team size, org context)
- "Who do you work with most closely?" (potential first contacts)
- "What's your typical work rhythm?" (meetings, async, etc.)

### Phase 3: Personal life

Transition naturally — "Now let's set up the personal side too."

- "What does your life outside work look like?" (family, living situation)
- "Any ongoing personal projects?" (renovation, learning a language, training for a race)
- "What are your main personal responsibilities?" (health, finances, kids' activities, home maintenance)
- "Any hobbies or interests you'd like to track notes on?"

### Phase 4: Preferences

- "How should I communicate with you? Direct and technical, casual, concise?" (tone)
- "Any rules you want me to always follow?" (custom rules)

### Phase 5: Setup

Based on the conversation, do all of this:

1. **Write brainkit.toml** via `brain_write` at path `brainkit.toml`:
   - Set name, role, expertise, tone
   - Set scope to "both" (since we're covering personal and professional)
   - Write a rich `context` field summarizing everything learned:
     ```
     context = """
     Professional: [role] at [company]. [team context]. Current projects: [list].
     Personal: [family/living situation]. Interests: [hobbies]. Areas: [personal responsibilities].
     """
     ```
   - Set features (all enabled by default)
   - Add any custom rules mentioned

2. **Call brain_setup_vault** with the vault path (if not already set)

3. **Call brain_doctor** to create PARA structure

4. **Pre-create directories** via `brain_write` based on what was discussed:
   - Professional projects mentioned → create in `01_projects/` with README.md
   - Personal areas mentioned → create in `02_areas/` with README.md (e.g., `02_areas/health/`, `02_areas/finances/`)
   - Personal projects mentioned → create in `01_projects/` with README.md
   - Interests → create in `03_resources/` with README.md

5. **First entries:**
   - If they mentioned a recent accomplishment → offer to add as first brag entry
   - If they mentioned colleagues → offer to add as first contacts

## Tone

- Warm but efficient. Not overly chatty, not robotic.
- One topic at a time — don't dump all questions at once.
- If the user wants to skip personal stuff, respect that immediately.
- Summarize what you've set up at the end: "I've created X directories, added Y to your config..."

## Key principle

By the end of onboarding, the vault should feel personalized — not empty and generic. The user should see directories that match their actual life and a config that reflects who they are.
