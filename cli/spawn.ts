import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

/**
 * Quote a single argument for safe passage through cmd.exe.
 *
 * When Node.js spawns with `shell: true` on Windows, it constructs:
 *   cmd.exe /d /s /c "binary arg1 arg2 ..."
 * cmd.exe then re-tokenizes the inner string on whitespace, breaking any
 * arg that contains spaces.  Wrapping such args in double quotes prevents
 * this.  Any existing double quotes inside the arg are escaped with `\"`.
 */
function quoteWindowsArg(arg: string): string {
  if (!arg.includes(" ") && !arg.includes('"')) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * Spawn a CLI binary, handling Windows .cmd shim resolution.
 *
 * On Windows, npm-installed CLIs live behind `.cmd` shims that
 * `child_process.spawn` can only find when `shell: true`.  However,
 * `shell: true` causes cmd.exe to re-split args on whitespace — breaking
 * any argument that contains spaces (like an onboarding prompt).
 *
 * This helper sets `shell: true` on Windows and quotes args to compensate,
 * while leaving Unix spawns untouched.
 */
export function spawnHarness(binary: string, args: string[], opts?: SpawnOptions): ChildProcess {
  const isWindows = process.platform === "win32";
  const spawnArgs = isWindows ? args.map(quoteWindowsArg) : args;
  return spawn(binary, spawnArgs, { ...opts, shell: isWindows });
}
