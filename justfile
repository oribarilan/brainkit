# brainkit development commands
# run `just` to see all available recipes

# default: list all recipes
default:
    @just --list

# start pi with the latest local brainkit extension
dev:
    pi -e .

# run tests
test:
    npx vitest run

# run tests in watch mode
test-watch:
    npx vitest --watch

# lint with eslint + typecheck with tsc
lint:
    npx eslint extensions/ cli/
    npx tsc --noEmit
    npx tsc --project cli/tsconfig.json --noEmit

# format with prettier
format:
    npx prettier --write .

# check formatting without writing
format-check:
    npx prettier --check .

# run all checks (lint + format check + test)
check:
    just lint
    just format-check
    just test

# build CLI for npm distribution
build-cli:
    npx tsc --project cli/tsconfig.json
