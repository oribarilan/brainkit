# cross-platform-user-facing-paths

## Context

Several user-facing messages and AI prompts hardcode Unix path conventions (`~/`, `~/.config/`), which are confusing for Windows users.

**Locations:**

1. **Onboarding prompt** (`core/onboarding-prompt.ts:13,27-32`): Suggests `~/brain` as default path, instructs AI to create config at `~/.config/brainkit/config.toml` with `brain_path = "~/brain"`.

2. **Tilde expansion** (`cli/launch.ts:151`, `opencode/server.ts:28`): `brain_path.replace(/^~/, os.homedir())` — works but produces mixed separators on Windows (e.g., `C:\Users\name/brain`). Should normalize.

3. **Sidebar vault path** (`opencode/side.tsx:74`): Displays the raw `vaultPath` string. This uses whatever separators the OS produces — correct per platform, but if the stored `brain_path` used `~/brain` and was expanded with mixed separators, the display would be inconsistent.

**Value delivered**: Windows users see familiar paths in prompts and error messages.

## Related Files

- `core/onboarding-prompt.ts` — Lines 13, 27-32
- `cli/launch.ts` — Line 151 (tilde expansion)
- `opencode/server.ts` — Line 28 (tilde expansion)
- `opencode/side.tsx` — Line 74 (vault path display)

## Dependencies

- `cross-platform-config-dir.md` (the config dir path in the onboarding prompt depends on `getConfigDir()` being platform-aware first)

## Acceptance Criteria

- [x] Onboarding prompt uses platform-appropriate path suggestions (e.g., `~/brain` on macOS, `C:\Users\<name>\brain` or a friendlier equivalent on Windows)
- [x] Onboarding prompt instructs AI to create config at the platform-appropriate config directory
- [x] Tilde expansion at both `cli/launch.ts:151` and `opencode/server.ts:28` normalizes path separators via `path.resolve()` or `path.normalize()`
- [x] macOS/Linux messages are unchanged
- [x] Tests pass

## Verification

- **Automated**: Unit test for tilde expansion producing normalized paths
- **Ad-hoc**: Review onboarding prompt output for both platforms

## Notes

**Note: the error message at `cli/launch.ts:181` is handled by `cross-platform-config-dir.md`, not this task.**

### Tilde expansion fix

Change:

```ts
const brainPath = globalConfig.brain_path.replace(/^~/, os.homedir());
```

to:

```ts
const brainPath = path.resolve(globalConfig.brain_path.replace(/^~/, os.homedir()));
```

`path.resolve()` normalizes separators on all platforms. Apply to both `cli/launch.ts:151` and `opencode/server.ts:28`.

### Onboarding prompt

The `brain_path = "~/brain"` convention in the config TOML is fine to keep cross-platform — the tilde expansion code handles it on all platforms (with the `path.resolve()` fix above). The prompt changes are for **user-facing display** only — what the AI tells the user during setup.

Simplest approach: make `buildOnboardingPrompt()` detect `process.platform` and conditionally use Windows-friendly path examples in the prompt text. The AI will then suggest appropriate paths to the user.

### Sidebar path display

`opencode/side.tsx:74` displays `d.path` which comes from `process.env.BRAINKIT_VAULT_PATH`. If tilde expansion is fixed (normalized via `path.resolve()`), the sidebar will display consistent platform-native paths. No additional change needed in `side.tsx` itself — the fix is upstream in the expansion logic.
