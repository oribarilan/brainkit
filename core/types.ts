export interface BrainkitGlobalConfig {
  vaultPath: string;
  lastSeenVersion?: string;
}

export interface BrainkitConfig {
  brainkit: { version: string };
  user: {
    name: string;
    role: string;
    expertise: string[];
    tone: string;
    scope: "professional" | "personal" | "both";
    context?: string;
    rules?: string[];
  };
  features: {
    bragfile: boolean;
    contacts: boolean;
  };
  agents?: { providers?: string[] };
}

export interface BragEntry {
  description: string;
  date?: string;
}

export interface BragStats {
  totalEntries: number;
  lastEntryDate: string | null;
  entriesByMonth: Record<string, number>;
}

export interface Contact {
  name: string;
  alias?: string;
  role?: string;
  team?: string;
  relation?: string;
  connection?: string;
  relevantFor?: string;
}

export interface HealthCheckResult {
  check: string;
  status: "pass" | "warn" | "error";
  message: string;
}
