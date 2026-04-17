// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createMemo } from "solid-js";
import { Tips } from "./tips.tsx";
import { Sidebar } from "./side.tsx";
import { logoLarge } from "./logo.ts";

const id = "brainkit";

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

const tui: TuiPlugin = async (api) => {
  await api.theme.install("./brainkit.json");
  api.theme.set("brainkit");

  // Disable built-in tips — we show our own
  const builtinTips = api.plugins.list().find((entry) => entry.id === "internal:home-tips");
  if (builtinTips?.enabled && builtinTips.active) {
    await api.plugins.deactivate("internal:home-tips");
  }

  api.slots.register({
    slots: {
      home_logo() {
        return <Home api={api} />;
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
