# brainkit development commands
# run `just` to see all available recipes

# default: list all recipes
default:
    @just --list

# start opencode with the local brainkit plugin
dev:
    just oc

# run the CLI from source (test the full launch experience, isolated from user config)
run *args:
    BRAINKIT_CONFIG_DIR={{justfile_directory()}}/.dev/user-config npx tsx cli/index.ts {{args}}

# reset dev config for a clean first-run experience
reset:
    rm -rf {{justfile_directory()}}/.dev/user-config
    @echo "Dev config reset. Run 'just run' for a fresh start."

# Wipes brainkit-side state under .dev/user-config/ each run. Your real
# ~/.config/brainkit/ and ~/.claude/ stay untouched. Claude auth comes from
# your real ~/.claude/ — no need to re-authenticate per run.
#
# Usage:
#   just fresh              # auto-detect harness like bare `brainkit`
#   just fresh oc           # or 'opencode'
#   just fresh cp           # or 'copilot'
#   just fresh claude       # or 'cc'
#
# factory-reset dev config and launch a harness for a true first-run test
fresh *args:
    rm -rf {{justfile_directory()}}/.dev/user-config
    @echo "Dev config reset. Launching fresh first-run experience..."
    BRAINKIT_CONFIG_DIR={{justfile_directory()}}/.dev/user-config npx tsx cli/index.ts {{args}}

# launch opencode with the local brainkit plugin
oc:
    OPENCODE_CONFIG={{justfile_directory()}}/.dev/opencode.json OPENCODE_TUI_CONFIG={{justfile_directory()}}/.dev/tui.json opencode

# launch copilot with the local brainkit plugin (installs skills/hooks/AGENTS.md into vault, then spawns copilot)
cp:
    npx tsx cli/index.ts copilot

# run tests
test:
    npx vitest run

# run tests in watch mode
test-watch:
    npx vitest --watch

# lint with eslint + typecheck with tsc
lint:
    npx eslint cli/ core/
    npx tsc --noEmit
    npx tsc --project cli/tsconfig.json --noEmit

# format with prettier
format:
    npx prettier --write .

# check formatting without writing
format-check:
    npx prettier --check .

# run all checks (lint + format check + test + package integrity)
check:
    just lint
    just format-check
    just test
    just test-package

# build CLI for npm distribution
build-cli:
    npx tsc --project cli/tsconfig.json

# test npm package integrity (pack, install, verify)
test-package:
    #!/usr/bin/env bash
    set -euo pipefail
    TARBALL=$(npm pack --pack-destination /tmp 2>/dev/null | tail -1)
    TMPDIR=$(mktemp -d)
    trap 'rm -rf "$TMPDIR" "/tmp/$TARBALL"' EXIT
    cd "$TMPDIR"
    npm init -y --silent > /dev/null 2>&1
    npm install "/tmp/$TARBALL" --silent > /dev/null 2>&1
    # Verify CLI binary exists and runs
    node node_modules/@2brain/brainkit/dist/cli/index.js --help > /dev/null
    # Verify key directories exist
    for dir in core opencode skills dist; do
        if [ ! -d "node_modules/@2brain/brainkit/$dir" ]; then
            echo "FAIL: missing directory $dir" >&2
            exit 1
        fi
    done
    # Verify plugin exports exist
    for f in opencode/server.ts opencode/tui.tsx; do
        if [ ! -f "node_modules/@2brain/brainkit/$f" ]; then
            echo "FAIL: missing export file $f" >&2
            exit 1
        fi
    done
    # Verify test files are NOT shipped
    if [ -d "node_modules/@2brain/brainkit/core/__tests__" ]; then
        echo "FAIL: core/__tests__/ should not be in the package" >&2
        exit 1
    fi
    echo "Package integrity check passed"
