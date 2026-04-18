export interface BrainkitGlobalConfig {
  version: number;
  vault_path: string;
}

export interface BrainkitConfig {
  version: number;
  user: {
    name: string;
    role: string;
    expertise?: string[];
    tone?: string;
    scope?: "professional" | "personal" | "both";
    work?: {
      description?: string;
    };
    personal?: {
      description?: string;
    };
    customization?: {
      context?: string;
      rules?: string[];
      onboarding_complete?: boolean;
    };
  };
  features?: {
    bragfile?: boolean;
    contacts?: boolean;
  };
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
