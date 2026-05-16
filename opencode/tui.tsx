// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createMemo, createSignal } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import { Tips } from "./tips.tsx";
import { Sidebar } from "./side.tsx";
import { logoLarge, logoLargeWidth, logoMedium, logoSmall } from "./logo.ts";

const id = "brainkit";

type Api = Parameters<TuiPlugin>[0];

const Home = (props: { api: Api }) => {
  const theme = createMemo(() => props.api.theme.current);
  const dim = useTerminalDimensions();
  const [chrome, setChrome] = createSignal({ width: 0, height: 0 });

  const logo = createMemo(() => {
    const term = dim();
    const gap = chrome();
    const h = Math.max(0, term.height - gap.height);
    const w = Math.max(0, term.width - gap.width);

    if (h >= logoLarge.length && w >= logoLargeWidth) return logoLarge;
    if (logoMedium.length > 0 && h >= logoMedium.length) return logoMedium;
    if (logoSmall.length > 0 && h >= logoSmall.length) return logoSmall;
    return null;
  });

  return (
    <box
      onSizeChange={function () {
        const term = dim();
        const own = { width: this.width, height: this.height };
        const next = {
          width: Math.max(0, term.width - own.width),
          height: Math.max(0, term.height - own.height),
        };
        setChrome((prev) => {
          const width = prev.width > 0 ? Math.min(prev.width, next.width) : next.width;
          const height = prev.height > 0 ? Math.min(prev.height, next.height) : next.height;
          if (prev.width === width && prev.height === height) return prev;
          return { width, height };
        });
      }}
      flexDirection="column"
      alignItems="center"
      flexShrink={1}
    >
      {(() => {
        const lines = logo();
        if (!lines) return null;
        return lines.map((line) => (
          <text fg={theme().primary}>{line}</text>
        ));
      })()}
    </box>
  );
};

const brainkitPlaceholders = {
  normal: [
    "Tell me about your day...",
    "What did you accomplish this week?",
    "Add a brag entry for shipping the new API",
    "Search my vault for meeting notes with Sarah",
    "Who's on the platform team?",
    "Create meeting notes from today's standup",
    "What's in my bragfile this quarter?",
    "Help me organize my project notes",
  ],
  shell:
    process.platform === "win32"
      ? []
      : [
          "grep -r 'action item' ~/second-brain/01_projects/",
          "cat ~/second-brain/02_areas/career/bragfile.md",
          "find ~/second-brain -name '*.md' -mtime -7",
          "wc -l ~/second-brain/03_resources/contacts.md",
        ],
};

const tui: TuiPlugin = async (api) => {
  // The brainkit theme is intentionally NOT installed in any harness right
  // now. The theme JSON (opencode/brainkit.json) and path resolver
  // (opencode/theme-path.ts) are kept dormant in the repo so we can wire it
  // up later without rebuilding it from scratch. See AGENTS.md for the
  // reason: api.theme.install writes to <XDG_CONFIG_HOME>/opencode/themes/,
  // which OPENCODE_CONFIG_DIR cannot redirect, so it leaks into the user's
  // global OpenCode config dir. Until that's solved, the brainkit TUI uses
  // whatever theme the user has selected in OpenCode.

  api.slots.register({
    slots: {
      home_logo() {
        return <Home api={api} />;
      },
      home_prompt(ctx, value) {
        if (!("Prompt" in api.ui) || !("Slot" in api.ui)) return null;
        const Prompt = api.ui.Prompt;
        const Slot = api.ui.Slot;
        const theme = ctx.theme.current;
        const Hint = (
          <box flexShrink={0} flexDirection="row" gap={1}>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.primary }}>brainkit</span>
            </text>
          </box>
        );
        return (
          <Prompt
            workspaceID={value.workspace_id}
            hint={Hint}
            right={
              <box flexDirection="row" gap={1}>
                <Slot name="home_prompt_right" workspace_id={value.workspace_id} />
              </box>
            }
            placeholders={brainkitPlaceholders}
          />
        );
      },
    },
  });

  api.slots.register({
    order: 100,
    slots: {
      home_bottom(ctx) {
        return <Tips theme={ctx.theme.current} />;
      },
    },
  });

  api.slots.register({
    order: 50,
    slots: {
      sidebar_content(ctx) {
        return <Sidebar api={api} />;
      },
    },
  });

  api.command.register(() => [
    {
      title: "Run vault health checks",
      value: "brainkit.doctor",
      category: "Brainkit",
      slash: { name: "doctor" },
      onSelect() {
        api.chat.submit("Run vault health checks using /doctor and report the results.");
      },
    },
  ]);

  // All our slots/commands are registered. Now safe to deactivate the built-in
  // tips. The user always has *some* tips, never zero. (This invariant relies
  // on slot/command registration being synchronous on the API surface.)
  const builtinTips = api.plugins.list().find((entry) => entry.id === "internal:home-tips");
  if (builtinTips?.enabled && builtinTips.active) {
    await api.plugins.deactivate("internal:home-tips");
  }

  // Restore built-in tips on plugin dispose
  api.lifecycle.onDispose(async () => {
    await api.plugins.activate("internal:home-tips");
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
};

export default plugin;
