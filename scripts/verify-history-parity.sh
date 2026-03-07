#!/usr/bin/env bash

set -u -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

SOURCE_REPO="$REPO_ROOT"
TARGET_REPO="$REPO_ROOT/../mrbro.dev"
NEGATIVE_MODE=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_usage() {
    printf 'Usage: %s [--source <path>] [--target <path>] [--negative]\n' "$0"
}

print_info() {
    printf '%bℹ%b %s\n' "$YELLOW" "$NC" "$1"
}

print_ok() {
    printf '%b✓%b %s\n' "$GREEN" "$NC" "$1"
}

print_fail() {
    printf '%b✗%b %s\n' "$RED" "$NC" "$1"
}

fail() {
    print_fail "$1"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
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
    --negative)
        NEGATIVE_MODE=1
        shift
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

repo_precheck() {
    local label="$1"
    local path="$2"

    if [[ ! -d "$path" ]]; then
        fail "$label repository path does not exist: $path"
    fi

    if ! git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        fail "$label repository is not a git repo: $path"
    fi

    print_ok "$label repository is valid: $path"
}

metric_commit_count() {
    local repo="$1"
    local out
    out="$(git -C "$repo" rev-list --all --count 2>/dev/null || true)"
    if [[ -z "$out" ]]; then
        out=0
    fi

    printf '%s\n' "$out"
}

metric_tag_count() {
    local repo="$1"
    git -C "$repo" tag | wc -l | tr -d ' '
}

metric_author_count() {
    local repo="$1"
    local commit_count
    commit_count="$(metric_commit_count "$repo")"
    if [[ "$commit_count" -eq 0 ]]; then
        printf '0\n'
        return
    fi

    git -C "$repo" log --format='%ae' | sort -u | wc -l | tr -d ' '
}

metric_remote_branch_count() {
    local repo="$1"
    git -C "$repo" branch -r | wc -l | tr -d ' '
}

compare_metric() {
    local name="$1"
    local source_value="$2"
    local target_value="$3"

    print_info "$name source=$source_value target=$target_value"
    if [[ "$source_value" == "$target_value" ]]; then
        print_ok "$name match"
        return 0
    fi

    print_fail "$name mismatch"
    return 1
}

printf 'Verifying history parity\n'
printf 'Source repo: %s\n' "$SOURCE_REPO"
printf 'Target repo: %s\n' "$TARGET_REPO"
printf 'Negative mode: %s\n\n' "$NEGATIVE_MODE"

repo_precheck "Source" "$SOURCE_REPO"
repo_precheck "Target" "$TARGET_REPO"

SOURCE_COMMIT_COUNT="$(metric_commit_count "$SOURCE_REPO")"
TARGET_COMMIT_COUNT="$(metric_commit_count "$TARGET_REPO")"
SOURCE_TAG_COUNT="$(metric_tag_count "$SOURCE_REPO")"
TARGET_TAG_COUNT="$(metric_tag_count "$TARGET_REPO")"
SOURCE_AUTHOR_COUNT="$(metric_author_count "$SOURCE_REPO")"
TARGET_AUTHOR_COUNT="$(metric_author_count "$TARGET_REPO")"
SOURCE_REMOTE_BRANCH_COUNT="$(metric_remote_branch_count "$SOURCE_REPO")"
TARGET_REMOTE_BRANCH_COUNT="$(metric_remote_branch_count "$TARGET_REPO")"

FAILURES=0

if ! compare_metric "Commit count" "$SOURCE_COMMIT_COUNT" "$TARGET_COMMIT_COUNT"; then
    FAILURES=$((FAILURES + 1))
fi

if ! compare_metric "Tag count" "$SOURCE_TAG_COUNT" "$TARGET_TAG_COUNT"; then
    FAILURES=$((FAILURES + 1))
fi

if ! compare_metric "Unique author count" "$SOURCE_AUTHOR_COUNT" "$TARGET_AUTHOR_COUNT"; then
    FAILURES=$((FAILURES + 1))
fi

if ! compare_metric "Remote branch count" "$SOURCE_REMOTE_BRANCH_COUNT" "$TARGET_REMOTE_BRANCH_COUNT"; then
    FAILURES=$((FAILURES + 1))
fi

if [[ "$NEGATIVE_MODE" -eq 1 ]]; then
    print_info "Running negative guard check with intentionally wrong target commit baseline"
    WRONG_TARGET_COMMIT_COUNT=$((TARGET_COMMIT_COUNT + 1))
    if [[ "$SOURCE_COMMIT_COUNT" == "$WRONG_TARGET_COMMIT_COUNT" ]]; then
        fail "Negative guard failed: wrong baseline unexpectedly matched source"
    fi

    print_ok "Negative guard passed: wrong baseline does not match source"
fi

printf '\n'
if [[ "$FAILURES" -eq 0 ]]; then
    print_ok "All history parity checks passed"
    exit 0
fi

print_fail "History parity checks failed: $FAILURES mismatch(es)"
exit 1
