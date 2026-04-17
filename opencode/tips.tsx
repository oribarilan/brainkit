// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { createSignal, onCleanup } from "solid-js";

const tips = [
  "/doctor to check vault health",
  "mention an accomplishment and I'll offer to capture it",
  "I can create meeting notes from any conversation",
  "ask me about your vault stats",
  "I can search your vault for anything",
  "I organize using the PARA method",
  "I'll remind you if your bragfile gets stale",
  "@ a vault file to add it as context",
];

export const Tips = (props: { theme: TuiThemeCurrent }) => {
  const [index, setIndex] = createSignal(Math.floor(Math.random() * tips.length));

  const interval = setInterval(() => {
    setIndex((prev) => (prev + 1) % tips.length);
  }, 8000);

  onCleanup(() => clearInterval(interval));

  return (
    <box height={4} minHeight={0} width="100%" maxWidth={75} alignItems="center" paddingTop={3} flexShrink={1}>
      <box flexDirection="row" maxWidth="100%">
        <text flexShrink={0} style={{ fg: props.theme.warning }}>
          ● Tip{" "}
        </text>
        <text flexShrink={1} fg={props.theme.textMuted}>
          {tips[index()]}
        </text>
      </box>
    </box>
  );
};
