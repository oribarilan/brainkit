# cross-platform-config-dir

## Context

`getConfigDir()` in `core/vault.ts:51` hardcodes `~/.config/brainkit` as the config directory:

```ts
return process.env["BRAINKIT_CONFIG_DIR"] ?? path.join(os.homedir(), ".config", "brainkit");
```

On macOS/Linux, `~/.config/` is the standard XDG config location. On Windows, the convention is `%APPDATA%` (e.g., `C:\Users\<name>\AppData\Roaming`). While `.config` will technically work on Windows, it's non-standard and the dot-prefix convention doesn't apply on NTFS.

Additionally, the error message at `cli/launch.ts:181` hardcodes `~/.config/brainkit/config.toml`, which is meaningless to Windows users.

**Value delivered**: Config files land in the platform-appropriate location on Windows, and error messages reference the correct path.

## Related Files

- `core/vault.ts:51` — `getConfigDir()` function
- `cli/launch.ts:181` — error message hardcodes `~/.config/brainkit/config.toml`

## Dependencies

- None (independent, but best done after binary resolution)

## Acceptance Criteria

- [x] `getConfigDir()` returns `%APPDATA%\brainkit` on Windows and `~/.config/brainkit` on macOS/Linux
- [x] `BRAINKIT_CONFIG_DIR` env var still overrides on all platforms
- [x] Error message in `cli/launch.ts:181` uses the actual resolved config path (via `getConfigDir()`) instead of hardcoded `~/.config/brainkit/config.toml`
- [x] Tests pass

## Verification

- **Automated**: Unit test for `getConfigDir()` with mocked `process.platform` and `process.env.APPDATA`
- **Ad-hoc**: Run `just test` to confirm no regression

## Notes

Standard pattern:
```ts
function getConfigDir(): string {
  if (process.env["BRAINKIT_CONFIG_DIR"]) return process.env["BRAINKIT_CONFIG_DIR"];
  if (process.platform === "win32") {
    return path.join(process.env["APPDATA"] ?? path.join(os.homedir(), "AppData", "Roaming"), "brainkit");
  }
  return path.join(os.homedir(), ".config", "brainkit");
}
```

Using `APPDATA` (Roaming) is correct — it's the Windows standard for app config that should persist across logins on domain-joined machines. `LOCALAPPDATA` is for caches and large data.

For the error message at `cli/launch.ts:181`:
```ts
const configPath = path.join(getConfigDir(), "config.toml");
p.cancel(`Brain directory not found. Delete ${configPath} to reset.`);
```
