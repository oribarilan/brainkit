import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

import type { BrainkitConfig } from "../extensions/vault.js";
import { writeVaultConfig, PARA } from "../extensions/vault.js";
import { install } from "./install.js";

const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version: string };
const version = packageJson.version;

async function ask(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = await rl.question(`  ${question}${suffix}\n  > `);
  return answer.trim() || defaultValue || "";
}

export async function init(cwd: string): Promise<void> {
  console.log(`\n  [brainkit] Setting up a new vault in:\n             ${cwd}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const continueHere = await ask(rl, "Continue here? (Y/n)", "Y");
    if (continueHere.toLowerCase() === "n") {
      console.log("  [brainkit] cd into your vault directory and run again.");
      return;
    }

    // --- User questions ---
    let name = "";
    while (name === "") {
      name = await ask(rl, "What's your name?");
      if (name === "") {
        console.log("  [brainkit] Name is required.");
      }
    }

    let role = "";
    while (role === "") {
      role = await ask(rl, "What's your role?");
      if (role === "") {
        console.log("  [brainkit] Role is required.");
      }
    }

    const expertiseRaw = await ask(rl, "Areas of expertise? (comma-separated)");
    const expertise = expertiseRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const scope = (await ask(rl, "Scope? (professional / personal / both)", "both")) as
      | "professional"
      | "personal"
      | "both";

    const tone = await ask(rl, "Preferred tone? (direct / casual / concise)", "direct");

    // --- Coding agents ---
    console.log("\n  Which coding agent(s) do you use?");
    console.log("    1. GitHub Copilot");
    console.log("    2. OpenCode");
    console.log("    3. Codex");
    console.log("    4. Claude Code");
    console.log("");

    const agentChoices = await ask(rl, "Enter numbers, comma-separated (e.g. 1,4)");
    const providerIds = ["copilot", "opencode", "codex", "claude-code"];
    const providers = agentChoices
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((n) => {
        const idx = parseInt(n, 10) - 1;
        return providerIds[idx];
      })
      .filter((p): p is string => p !== undefined);

    // --- Build config ---
    const config: BrainkitConfig = {
      brainkit: { version },
      user: { name, role, expertise, tone, scope },
      features: { bragfile: true, contacts: true },
      agents: { providers },
    };

    // --- Create PARA directories ---
    const paraNames: Record<string, string> = {
      [PARA.projects]: "Projects",
      [PARA.areas]: "Areas",
      [PARA.resources]: "Resources",
      [PARA.archive]: "Archive",
    };

    for (const [dir, displayName] of Object.entries(paraNames)) {
      const dirPath = path.join(cwd, dir);
      fs.mkdirSync(dirPath, { recursive: true });
      const readmePath = path.join(dirPath, "README.md");
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, `# ${displayName}\n`, "utf-8");
      }
    }
    console.log("  [brainkit] Created PARA directories");

    // --- Create bragfile and contacts ---
    const bragDir = path.join(cwd, "02_areas", "career");
    fs.mkdirSync(bragDir, { recursive: true });
    const bragPath = path.join(cwd, "02_areas", "career", "bragfile.md");
    if (!fs.existsSync(bragPath)) {
      fs.writeFileSync(bragPath, "# Bragfile\n", "utf-8");
    }

    const contactsPath = path.join(cwd, "03_resources", "contacts.md");
    if (!fs.existsSync(contactsPath)) {
      fs.writeFileSync(contactsPath, "# Contacts\n", "utf-8");
    }
    console.log("  [brainkit] Created bragfile and contacts");

    // --- Write config ---
    writeVaultConfig(cwd, config);
    console.log("  [brainkit] Created brainkit.toml");

    // --- Install skills and AGENTS.md ---
    await install(cwd);

    console.log(`\n  [brainkit] Vault ready! Open this directory in your coding agent to get started.\n`);
  } finally {
    rl.close();
  }
}
