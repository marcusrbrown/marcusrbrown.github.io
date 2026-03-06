#!/usr/bin/env bash

set -u -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

SOURCE_REPO="$REPO_ROOT"
TARGET_REPO="$REPO_ROOT/../mrbro.dev"
MODE="dry-run"
EXPECTED_TARGET_REMOTE="github.com/marcusrbrown/mrbro.dev"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_usage() {
    printf 'Usage: %s [--dry-run] [--execute] [--source <path>] [--target <path>]\n' "$0"
    printf '  Default mode is --dry-run. Use --execute to perform mirror push.\n'
}

print_info() {
    printf '%bℹ%b %s\n' "$YELLOW" "$NC" "$1"
}

print_ok() {
    printf '%b✓%b %s\n' "$GREEN" "$NC" "$1"
}

print_error() {
    printf '%b✗%b %s\n' "$RED" "$NC" "$1" >&2
}

fail() {
    print_error "$1"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
    --dry-run)
        MODE="dry-run"
        shift
        ;;
    --execute)
        MODE="execute"
        shift
        ;;
    --source)
        if [[ $# -lt 2 ]]; then
            print_usage
            exit 2
        fi
        SOURCE_REPO="$2"
        shift 2
        ;;
    --target)
        if [[ $# -lt 2 ]]; then
            print_usage
            exit 2
        fi
        TARGET_REPO="$2"
        shift 2
        ;;
    -h | --help)
        print_usage
        exit 0
        ;;
    *)
        print_usage
        exit 2
        ;;
    esac
done

printf 'Preparing repository migration harness\n'
printf 'Source repo: %s\n' "$SOURCE_REPO"
printf 'Target repo: %s\n' "$TARGET_REPO"
printf 'Mode: %s\n\n' "$MODE"

if ! git -C "$SOURCE_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    fail "Source repository is not a valid git repo: $SOURCE_REPO"
fi
print_ok "Source repository is a valid git repo"

if [[ ! -d "$TARGET_REPO" ]]; then
    fail "Target repository path does not exist: $TARGET_REPO"
fi

if ! git -C "$TARGET_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    fail "Target repository is not a valid git repo: $TARGET_REPO"
fi
print_ok "Target repository is a valid git repo"

TARGET_REMOTE_URL="$(git -C "$TARGET_REPO" remote get-url origin 2>/dev/null || true)"
if [[ -z "$TARGET_REMOTE_URL" ]]; then
    fail "Target repository has no origin remote configured"
fi
print_ok "Target origin remote configured: $TARGET_REMOTE_URL"

if [[ "$TARGET_REMOTE_URL" != *"$EXPECTED_TARGET_REMOTE"* ]]; then
    fail "Target origin remote does not match expected repo ($EXPECTED_TARGET_REMOTE)"
fi
print_ok "Target origin remote matches expected repository"

if ! git ls-remote "$TARGET_REMOTE_URL" >/dev/null 2>&1; then
    fail "Target remote is not reachable: $TARGET_REMOTE_URL"
fi
print_ok "Target remote is reachable"

printf '\nMirror migration command sequence:\n'
printf '  1) Validate source and target repos\n'
printf '  2) Validate target remote reachability\n'
printf '  3) Run: git -C "%s" push --mirror "%s"\n' "$SOURCE_REPO" "$TARGET_REMOTE_URL"

if [[ "$MODE" == "dry-run" ]]; then
    printf '\n'
    print_info "Dry-run mode: no refs will be pushed"
    print_ok "Precondition checks passed; mirror push command is ready"
    exit 0
fi

printf '\n'
print_info "Execute mode enabled: performing mirror push"
if git -C "$SOURCE_REPO" push --mirror "$TARGET_REMOTE_URL"; then
    print_ok "Mirror push completed successfully"
    exit 0
fi

fail "Mirror push failed"
