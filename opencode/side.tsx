// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui";
import { createMemo } from "solid-js";
import { readGlobalConfig, readVaultConfig, getBragStats, readContacts, parseContacts } from "@oribish/brainkit-core";

type Api = Parameters<import("@opencode-ai/plugin/tui").TuiPlugin>[0];

const staleness = (lastEntryDate: string | null): { label: string; color: string } => {
  if (!lastEntryDate) return { label: "never", color: "#E85050" };
  const days = Math.floor((Date.now() - new Date(lastEntryDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 7) return { label: `${days}d ago`, color: "#50E850" };
  if (days <= 14) return { label: `${days}d ago`, color: "#E8E850" };
  return { label: `${days}d ago`, color: "#E85050" };
};

export const Sidebar = (props: { api: Api }) => {
  const theme = createMemo(() => props.api.theme.current);

  const data = createMemo(() => {
    try {
      const globalConfig = readGlobalConfig();
      if (!globalConfig) return null;
      const vaultConfig = readVaultConfig(globalConfig.vaultPath);
      if (!vaultConfig) return null;

      const stats = vaultConfig.features.bragfile ? getBragStats(globalConfig.vaultPath) : null;
      let contactCount = 0;
      if (vaultConfig.features.contacts) {
        try {
          const raw = readContacts(globalConfig.vaultPath);
          const contacts = parseContacts(raw);
          contactCount = contacts.length;
        } catch {
          // ignore
        }
      }

      return {
        name: vaultConfig.user.name,
        path: globalConfig.vaultPath,
        features: vaultConfig.features,
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

        const bragStale = d.bragStats ? staleness(d.bragStats.lastEntryDate) : null;

        return (
          <>
            <box flexDirection="column">
              <text fg={theme().primary} bold>
                🧠 {d.name}'s vault
              </text>
              <text fg={theme().textMuted}>{d.path}</text>
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
