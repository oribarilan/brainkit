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
  readGlobalConfig,
  writeGlobalConfig,
  readVaultConfig,
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
  runHealthChecks,
} from "./vault.js";

// System prompt
export { detectProjectContext, buildSystemPrompt } from "./system-prompt.js";
export type { PromptMode } from "./system-prompt.js";

// Auto-commit
export { scheduleAutoCommit, flushAutoCommit } from "./auto-commit.js";

// Detection helpers
export { ACCOMPLISHMENT_KEYWORDS, containsUserAccomplishment, notifyDesktop } from "./hooks.js";
