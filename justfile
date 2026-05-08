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

# Pack the current branch and install it into .dev/install/ so harness
# launchers resolve `@2brain/brainkit` to *this* checkout, not the published
# version. Runs `prepack` (tsc + shim generator). Idempotent — rerun to pick
# up source changes.
#
# build + install brainkit dev tarball into .dev/install/
dev-install:
    #!/usr/bin/env bash
    set -euo pipefail
    cd {{justfile_directory()}}
    rm -rf .dev/install
    mkdir -p .dev/install
    cd .dev/install
    npm init -y --silent > /dev/null
    TARBALL=$(cd {{justfile_directory()}} && npm pack --pack-destination {{justfile_directory()}}/.dev/install 2>&1 | tail -1)
    npm install "./$TARBALL" --silent --no-audit --no-fund
    rm -f "$TARBALL"
    # The package's prepack script generates core/*.js shims for npm consumers.
    # In dev they confuse eslint (the .js files aren't in tsconfig). They're
    # safely ignored at runtime — strip them so `just lint` stays clean.
    rm -f {{justfile_directory()}}/core/*.js
    echo "Installed brainkit dev build into .dev/install/"

# wipe .dev/ install + isolated config + isolated XDG dirs
dev-clean:
    rm -rf {{justfile_directory()}}/.dev/install \
           {{justfile_directory()}}/.dev/user-config \
           {{justfile_directory()}}/.dev/xdg
    @echo "Dev install + config + XDG dirs cleared."

# Launch opencode against the dev-installed brainkit (build + install + launch).
#
# Why this is more than just `opencode`: brainkit's launcher writes
# plugin: ["@2brain/brainkit"] into ~/.config/brainkit/opencode.json, and
# OpenCode auto-installs that package from npm into its plugin cache. To make
# OpenCode use *this* checkout instead of the published version, we:
#   1. Build + install our package into .dev/install/ (via dev-install).
#   2. Redirect OpenCode's XDG_CACHE_HOME to .dev/xdg/cache.
#   3. Pre-seed the cache by symlinking our dev install into the spot
#      OpenCode's Npm.add() checks first. The cache hit short-circuits the
#      npm install and OpenCode loads our dev build.
# Auth/MCP/model still come from your real ~/.config/opencode/ (we only
# redirect cache, not config). BRAINKIT_CONFIG_DIR isolates brainkit's own
# config under .dev/user-config/.
#
# launch opencode against the dev-installed brainkit
oc: dev-install
    #!/usr/bin/env bash
    set -euo pipefail
    cd {{justfile_directory()}}
    # OpenCode's Npm.add() short-circuits when path.join(cacheDir, "node_modules", name)
    # already exists. We symlink the entire node_modules dir so brainkit AND its
    # runtime deps (smol-toml, etc.) are reachable via the parent-dir walk.
    PKG_CACHE_DIR=.dev/xdg/cache/opencode/packages/@2brain/brainkit
    rm -rf "$PKG_CACHE_DIR"
    mkdir -p "$PKG_CACHE_DIR"
    ln -s {{justfile_directory()}}/.dev/install/node_modules "$PKG_CACHE_DIR/node_modules"
    BRAINKIT_CONFIG_DIR={{justfile_directory()}}/.dev/user-config \
      XDG_CACHE_HOME={{justfile_directory()}}/.dev/xdg/cache \
      node {{justfile_directory()}}/.dev/install/node_modules/@2brain/brainkit/dist/cli/index.js oc

# Copilot's harness loads brainkit via files copied from the package root, so
# no plugin-cache trickery needed — running our dev CLI is enough.
#
# launch copilot against the dev-installed brainkit
cp: dev-install
    BRAINKIT_CONFIG_DIR={{justfile_directory()}}/.dev/user-config \
      node {{justfile_directory()}}/.dev/install/node_modules/@2brain/brainkit/dist/cli/index.js copilot

# Same as `cp`: Claude loads brainkit via files copied from the package root.
#
# launch claude code against the dev-installed brainkit
cc: dev-install
    BRAINKIT_CONFIG_DIR={{justfile_directory()}}/.dev/user-config \
      node {{justfile_directory()}}/.dev/install/node_modules/@2brain/brainkit/dist/cli/index.js claude

# alias for github copilot CLI (= `just cp`)
ghcp: cp

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
