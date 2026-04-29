// Theme path resolution for the brainkit TUI plugin.
//
// Anchored to this file's location via import.meta.url, NOT process cwd.
// The plugin file (tui.tsx) sits next to brainkit.json in the same directory,
// and so does this module — so resolving relative to import.meta.url here
// gives the same path the runtime plugin uses, regardless of where opencode
// is launched from.
//
// Extracted to its own module (no JSX, no solid-js, no @opencode-ai deps) so
// that the regression test can import and assert on the resolved path without
// pulling in the full TUI dependency tree.
import { fileURLToPath } from "node:url";
import * as path from "node:path";

export const themePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "brainkit.json");
