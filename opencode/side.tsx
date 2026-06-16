// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui";
import * as path from "node:path";
import { createMemo } from "solid-js";
import {
  readVaultConfigSimple,
  getBragStats,
  readContacts,
  parseContacts,
  stalenessCategory,
  daysSinceLastEntry,
} from "../core/index.ts";

type Api = Parameters<import("@opencode-ai/plugin/tui").TuiPlugin>[0];

const STALENESS_COLORS = { fresh: "#50E850", warning: "#E8E850", stale: "#E85050" } as const;

const staleness = (lastEntryDate: string | null): { label: string; color: string } => {
  const cat = stalenessCategory(lastEntryDate);
  if (cat === "never") return { label: "never", color: "#E85050" };
  const days = daysSinceLastEntry(lastEntryDate)!;
  return { label: `${days}d ago`, color: STALENESS_COLORS[cat] };
};

export const Sidebar = (props: { api: Api }) => {
  const theme = createMemo(() => props.api.theme.current);

  const vaultPath = process.env.BRAINKIT_VAULT_PATH;
  const isAllVaults = process.env.BRAINKIT_ALL_VAULTS === "1";

  const data = createMemo(() => {
    if (isAllVaults) {
      return { allVaults: true as const };
    }
    if (!vaultPath) return null;
    try {
      const vaultConfig = readVaultConfigSimple(vaultPath);
      if (!vaultConfig) return null;

      const vaultName = path.basename(vaultPath);
      const bragEnabled = vaultConfig.features?.bragfile !== false;
      const contactsEnabled = vaultConfig.features?.contacts !== false;
      const stats = bragEnabled ? getBragStats(vaultPath) : null;
      let contactCount = 0;
      if (contactsEnabled) {
        try {
          const raw = readContacts(vaultPath);
          const contacts = parseContacts(raw);
          contactCount = contacts.length;
        } catch {
          // ignore
        }
      }

      return {
        name: vaultConfig.user.name,
        vaultName,
        path: vaultPath,
        features: { bragfile: bragEnabled, contacts: contactsEnabled },
        bragStats: stats,
        contactCount,
      };
    } catch {
      return null;
    }
  });

  return (
    <box paddingLeft={1} paddingRight={1} flexDirection="column" gap={1}>
      {(() => {
        const d = data();
        if (!d) {
          return <text fg={theme().textMuted}>No vault configured</text>;
        }

        if ("allVaults" in d) {
          return (
            <box flexDirection="column">
              <text fg={theme().primary} bold>
                🧠 All vaults
              </text>
              <text fg={theme().textMuted}>Multi-vault mode</text>
            </box>
          );
        }

        const bragStale = d.bragStats ? staleness(d.bragStats.lastEntryDate) : null;

        return (
          <>
            <box flexDirection="column">
              <text fg={theme().primary} bold>
                🧠 {d.name}'s vault
              </text>
              <text fg={theme().textMuted}>
                {d.vaultName} — {d.path}
              </text>
            </box>

            {d.features.bragfile && d.bragStats && (
              <box flexDirection="column">
                <text fg={theme().text}>Brags: {d.bragStats.totalEntries}</text>
                <text>
                  <span style={{ fg: theme().textMuted }}>Last entry: </span>
                  <span style={{ fg: bragStale!.color }}>{bragStale!.label}</span>
                </text>
              </box>
            )}

            {d.features.contacts && <text fg={theme().text}>Contacts: {d.contactCount}</text>}
          </>
        );
      })()}
    </box>
  );
};
