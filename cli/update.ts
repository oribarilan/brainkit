import * as p from "@clack/prompts";
import { readGlobalConfig } from "../core/index.js";
import { checkForSelfUpdate } from "./self-update.js";
import { checkHarnessVersion } from "./harness-version.js";
import { resolveHarnessName } from "./launch.js";

export async function runUpdate(targetVersion?: string): Promise<void> {
  p.intro("brainkit update");

  await checkForSelfUpdate(targetVersion);

  const config = readGlobalConfig();
  const defaultAlias = config?.default_harness;
  if (defaultAlias !== undefined && defaultAlias.length > 0) {
    const harnessName = resolveHarnessName(defaultAlias);
    if (harnessName !== undefined) {
      await checkHarnessVersion(harnessName);
    }
  }

  p.outro("Done.");
}
