# verify-inline-hooks-schema

## Context

Copilot CLI supports two ways to define hooks:
- **File-based** (repository-level, in `.github/hooks/hooks.json`): array of `{ event, command, description }` per the current brainkit implementation in `cli/copilot.ts:98-111`.
- **Inline** (user-level, in `~/.copilot/settings.json` under the `hooks` key): the schema may be event-keyed (`{ hooks: { agentStop: [{ command, description }] } }`) rather than the array form.

Brainkit's new isolated config writes to `$COPILOT_HOME/settings.json` (user-level), so it must use the inline schema. The exact shape needs to be verified against the official "Use hooks" doc page before `generateCopilotSettings` is rewritten.

**Value delivered:** Confidence that `generateCopilotSettings` will produce a settings file Copilot actually understands. Avoids a debugging round during launcher implementation.

## Related Files

- `cli/copilot.ts:98-111` — current `HOOKS_CONFIG` shape (file-based)
- Will inform `cli/copilot.ts` `generateCopilotSettings` rewrite in `rewrite-copilot-launcher.md`

## Dependencies

- None. Can run in parallel with `add-copilot-config-dir-helper.md`.

## Acceptance Criteria

- [ ] Read `https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks` and capture the exact inline `hooks` schema for `settings.json`
- [ ] Smoke test: write a minimal `$COPILOT_HOME/settings.json` with one `agentStop` hook (e.g., a script that writes a marker file to `/tmp/`); run `copilot -p "..." --allow-all-tools` with `COPILOT_HOME=/tmp/...`; verify marker file is created (proves the hook fired)
- [ ] Smoke test: same for `sessionEnd`
- [ ] Document the verified schema as a comment in `specs/US-copilot-isolation.md` § "Inline hooks in settings.json", or update the example shape there if it differs from the assumed event-keyed object form
- [ ] Clean up `/tmp/` smoke-test artifacts

## Verification

- **Ad-hoc:** the marker files exist after the smoke test (proves Copilot read and executed the inline hook config). Run `cat /tmp/<marker>.txt` after the smoke test to confirm.

## Notes

If the schema differs from the assumed shape (event-keyed object), update the spec and inform `rewrite-copilot-launcher.md` before that task starts coding `generateCopilotSettings`.

If both schemas are accepted by Copilot (file-based array + event-keyed object), prefer the documented user-level shape — it's what `/init` would generate.

Possible smoke-test layout:
```bash
mkdir -p /tmp/bk-hooks-smoke /tmp/bk-hooks-smoke-cwd
cat > /tmp/bk-hooks-smoke/settings.json <<'EOF'
{
  "hooks": {
    "agentStop": [
      { "command": "echo agentStop-fired > /tmp/bk-hooks-smoke-marker.txt" }
    ]
  }
}
EOF
cd /tmp/bk-hooks-smoke-cwd
COPILOT_HOME=/tmp/bk-hooks-smoke copilot -p "say hello" --allow-all-tools
cat /tmp/bk-hooks-smoke-marker.txt
rm -rf /tmp/bk-hooks-smoke /tmp/bk-hooks-smoke-cwd /tmp/bk-hooks-smoke-marker.txt
```
