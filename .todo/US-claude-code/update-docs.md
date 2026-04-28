# update-docs

## Context

Add Claude Code to the documented surface, including the auth re-prompt UX cliff and uninstall instructions surfaced during plan review.

**Value delivered:** Users and future contributors know Claude Code is supported, how to use it, what to expect during first launch (auth re-prompt), and how to uninstall.

## Related Files

- `AGENTS.md`
- `README.md`
- `CONTRIBUTING.md` (if it lists harnesses)
- `specs/US-claude-code.md` (exists, no edit needed)

## Dependencies

- `register-claude-harness.md` (need final command surface)

## Acceptance Criteria

- [ ] `AGENTS.md` § Project Overview mentions Claude Code as a third harness.
- [ ] `AGENTS.md` § Harness Config Isolation explicitly lists Claude Code's rule: "use `CLAUDE_CONFIG_DIR` env var pointing at `~/.config/brainkit/claude/`. Never read or write `~/.claude/`. Never write to `<pkgRoot>/claude/` (read-only template — copy to `~/.config/brainkit/claude/plugin/` at launch instead)."
- [ ] `AGENTS.md` § Structure adds the new `claude/` directory and explains the template + staging-dir model.
- [ ] `README.md` lists `brainkit claude` and `brainkit cc` as supported invocations alongside `brainkit oc` and `brainkit copilot`.
- [ ] `README.md` includes a clear note: **"First launch of `brainkit claude` will prompt you to authenticate Claude Code. This is separate from your normal `claude` authentication because brainkit uses an isolated config directory. You will need a separate Claude session token under brainkit. This is intentional — brainkit never reads or writes your global `~/.claude/`."**
- [ ] `README.md` includes uninstall instructions: **"To remove brainkit's Claude integration: `rm -rf ~/.config/brainkit/claude/`. Your global `~/.claude/` is unaffected."**
- [ ] `README.md` discloses: "On first launch of `brainkit claude`, Claude Code will fetch the official Anthropic plugin marketplace (~4.4 MB) into the brainkit-isolated config directory at `~/.config/brainkit/claude/plugins/marketplaces/`. This is one-time per fresh install and stays isolated from your global `~/.claude/`."
- [ ] If `CONTRIBUTING.md` mentions harnesses (test commands, dev workflow), Claude is included.
- [ ] No documentation lies — every mentioned command actually works after `register-claude-harness.md` lands.

## Verification

- **Ad-hoc:** read each updated doc and cross-check claims against the implementation. Specifically run every command mentioned in `README.md` to confirm it works.

## Notes

Use the `devdoc` skill per the tasks-skill convention. Match the existing terse, factual tone of these docs.

The auth re-prompt note is essential — without it, users will think brainkit is broken or insecure when they're prompted to log in despite already being logged into Claude globally. This is a UX cliff worth flagging prominently.
