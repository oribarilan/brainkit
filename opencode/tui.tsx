// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createMemo } from "solid-js";
import { Tips } from "./tips.tsx";
import { Sidebar } from "./side.tsx";
import { logoLarge } from "./logo.ts";
import { themePath } from "./theme-path.ts";

const id = "brainkit";

// Re-export so the regression test can import it without pulling in JSX deps.
// (See ./theme-path.ts for why path resolution lives in its own module.)
export { themePath };

type Api = Parameters<TuiPlugin>[0];

const Home = (props: { api: Api }) => {
  const theme = createMemo(() => props.api.theme.current);

  return (
    <box flexDirection="column" alignItems="center">
      {logoLarge.map((line) => (
        <text fg={theme().primary}>{line}</text>
      ))}
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
  // Theme load is best-effort. If it fails (missing file, schema mismatch,
  // OpenCode API change), log + toast the user, and continue registering
  // everything else so the TUI degrades to default colors instead of
  // disappearing entirely.
  try {
    await api.theme.install(themePath);
    api.theme.set("brainkit");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[brainkit] failed to load custom theme: ${msg}`);
    if (typeof api.ui?.toast === "function") {
      api.ui.toast({
        variant: "error",
        title: "brainkit",
        message: "Failed to load custom theme; using default colors. See opencode logs for details.",
        duration: 8000,
      });
    }
  }

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
  // tips — if any registration above had thrown, we'd never reach here and the
  // built-in tips would remain as a fallback. The user always has *some* tips,
  // never zero. (This invariant relies on slot/command registration being
  // synchronous on the API surface.)
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
