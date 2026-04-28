// Types
export type {
  BrainkitGlobalConfig,
  BrainkitConfig,
  BragEntry,
  BragStats,
  Contact,
  HealthCheckResult,
} from "./types.js";

// Vault operations
export {
  PARA,
  KEY_FILES,
  getConfigDir,
  getCopilotConfigDir,
  readGlobalConfig,
  writeGlobalConfig,
  discoverVaults,
  readVaultConfig,
  readVaultConfigSimple,
  writeVaultConfig,
  readVaultFile,
  writeVaultFile,
  readBragfile,
  appendBragEntry,
  getBragStats,
  readContacts,
  parseContacts,
  searchContacts,
  addContact,
  isVaultFresh,
  detectVaultState,
  runHealthChecks,
  stalenessCategory,
  daysSinceLastEntry,
} from "./vault.js";
export type { VaultState, Migration, StalenessCategory } from "./vault.js";

// Migrations
export { CURRENT_SCHEMA_VERSION, migrateConfig } from "./migrations.js";

// System prompt
export { detectProjectContext, buildSystemPrompt } from "./system-prompt.js";
export type { PromptMode } from "./system-prompt.js";

// Onboarding
export { buildOnboardingPrompt } from "./onboarding-prompt.js";

// Agent prompts
export { buildThinkerPrompt, buildConsultantPrompt, buildLibrarianPrompt } from "./agent-prompts.js";

// Prompt sections (for custom composition)
export type { SectionContext } from "./prompt-sections.js";
export { joinSections } from "./prompt-sections.js";

// Auto-commit
export { scheduleAutoCommit, flushAutoCommit } from "./auto-commit.js";

// Detection helpers
export { ACCOMPLISHMENT_KEYWORDS, containsUserAccomplishment, notifyDesktop } from "./hooks.js";

// Skill installation
export { installSkills as installSkillsCore } from "./skill-installer.js";
export type {
  SkillInstallLayout,
  InstallSkillsOptions,
  CopilotFlatInstallOptions,
  PerDirInstallOptions,
  BuildSkillContentArgs,
  InstallSkillsResult,
} from "./skill-installer.js";
