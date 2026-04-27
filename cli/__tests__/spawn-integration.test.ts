import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnHarness } from "../spawn.js";

/**
 * Integration test: spawns a real child process through spawnHarness and
 * verifies the arguments arrive intact — no whitespace re-splitting.
 *
 * On Windows CI (shell: true), this catches real cmd.exe tokenization bugs.
 * On Unix, it confirms the no-shell path works correctly too.
 */
describe("spawnHarness integration", () => {
  // Write a tiny script that echoes its argv as JSON.
  // Using a file avoids `node -e` / `--` arg-parsing quirks.
  let scriptPath: string;

  beforeAll(() => {
    scriptPath = path.join(os.tmpdir(), "brainkit-echo-argv.js");
    fs.writeFileSync(scriptPath, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n", "utf-8");
  });

  afterAll(() => {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // best-effort cleanup
    }
  });

  function collectArgv(args: string[]): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const child = spawnHarness("node", [scriptPath, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.on("error", reject);
      child.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Child exited with code ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as string[]);
        } catch {
          reject(new Error(`Failed to parse child stdout: ${stdout}`));
        }
      });
    });
  }

  it("passes a multi-word string as a single argument", async () => {
    const argv = await collectArgv(["Let's set up my first brainkit vault!"]);
    expect(argv).toEqual(["Let's set up my first brainkit vault!"]);
  });

  it("passes multiple args including ones with spaces", async () => {
    const argv = await collectArgv(["-i", "--allow-all", "Hello world", "simple"]);
    expect(argv).toEqual(["-i", "--allow-all", "Hello world", "simple"]);
  });

  it("handles args with double quotes", async () => {
    const argv = await collectArgv(['He said "hello" today']);
    expect(argv).toEqual(['He said "hello" today']);
  });

  it("handles args without spaces unchanged", async () => {
    const argv = await collectArgv(["--flag", "value", "-v"]);
    expect(argv).toEqual(["--flag", "value", "-v"]);
  });
});
