---
name: doctor
description: Run brainkit vault health checks and report results.
disable-model-invocation: true
user-invocable: true
---

# Doctor

When the user invokes this skill, run the brainkit vault health checks and present the results clearly.

## What to do

1. Locate the active vault (resolve `brain_path` from `~/.config/brainkit/config.toml`, then identify the current vault directory).
2. Invoke `runHealthChecks(vaultPath)` from `core/vault.ts` — use the agent's filesystem and shell tools to execute it (e.g. via a short Node one-liner that imports the function), or replicate its checks directly if executing the module is impractical.
3. Report each check's status (pass / warn / fail) and any remediation guidance.

Keep the output concise and actionable. Group failures first, warnings next, passes last.
