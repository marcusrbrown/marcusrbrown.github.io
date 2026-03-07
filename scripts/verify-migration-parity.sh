#!/bin/bash
# Verification script for git history parity between source and target repos.
# Checks commit count, tag count, and author set match after migration.

set -u -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET_REPO="$REPO_ROOT/../mrbro.dev"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FAILURES=0

print_status() {
    local status=$1
    local message=$2
    if [[ $status -eq 0 ]]; then
        echo -e "${GREEN}✓${NC} $message"
    else
        echo -e "${RED}✗${NC} $message"
        FAILURES=$((FAILURES + 1))
    fi
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

echo "Verifying git history parity: source → mrbro.dev"
echo "Source repo: $REPO_ROOT"
echo "Target repo: $TARGET_REPO"
echo ""

# Check 1: Target repo exists
if [[ ! -d "$TARGET_REPO" ]]; then
    echo -e "${RED}ERROR:${NC} Target directory does not exist: $TARGET_REPO" >&2
    exit 1
fi
print_status 0 "Target directory exists: $TARGET_REPO"

# Check 2: Target is a git repo
if ! git -C "$TARGET_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo -e "${RED}ERROR:${NC} Target directory is not a git repository" >&2
    exit 1
fi
print_status 0 "Target is a valid git repository"

# Check 3: Target has commits (migration must have happened)
TARGET_COMMIT_COUNT=$(git -C "$TARGET_REPO" log --oneline 2>/dev/null | wc -l | tr -d ' ')
if [[ "$TARGET_COMMIT_COUNT" -eq 0 ]]; then
    print_status 1 "Target repo has no commits (migration not yet performed)"
    echo ""
    echo -e "${RED}FAIL:${NC} Migration parity check cannot proceed — mrbro.dev has 0 commits."
    echo "      Run the migration (Task 3) before verifying parity."
    exit 1
fi

# Check 4: Compare commit counts
SOURCE_COMMIT_COUNT=$(git -C "$REPO_ROOT" log --oneline | wc -l | tr -d ' ')
print_info "Source commit count: $SOURCE_COMMIT_COUNT"
print_info "Target commit count: $TARGET_COMMIT_COUNT"

if [[ "$SOURCE_COMMIT_COUNT" -eq "$TARGET_COMMIT_COUNT" ]]; then
    print_status 0 "Commit counts match: $SOURCE_COMMIT_COUNT"
else
    print_status 1 "Commit count mismatch: source=$SOURCE_COMMIT_COUNT target=$TARGET_COMMIT_COUNT"
fi

# Check 5: Compare tag counts
SOURCE_TAG_COUNT=$(git -C "$REPO_ROOT" tag | wc -l | tr -d ' ')
TARGET_TAG_COUNT=$(git -C "$TARGET_REPO" tag | wc -l | tr -d ' ')
print_info "Source tag count: $SOURCE_TAG_COUNT"
print_info "Target tag count: $TARGET_TAG_COUNT"

if [[ "$SOURCE_TAG_COUNT" -eq "$TARGET_TAG_COUNT" ]]; then
    print_status 0 "Tag counts match: $SOURCE_TAG_COUNT"
else
    print_status 1 "Tag count mismatch: source=$SOURCE_TAG_COUNT target=$TARGET_TAG_COUNT"
fi

# Check 6: Compare unique author sets
SOURCE_AUTHORS=$(git -C "$REPO_ROOT" log --format='%ae' | sort -u)
TARGET_AUTHORS=$(git -C "$TARGET_REPO" log --format='%ae' | sort -u)

if [[ "$SOURCE_AUTHORS" == "$TARGET_AUTHORS" ]]; then
    print_status 0 "Author sets match"
else
    print_status 1 "Author set mismatch"
    echo "  Source authors:"
    echo "$SOURCE_AUTHORS" | sed 's/^/    /'
    echo "  Target authors:"
    echo "$TARGET_AUTHORS" | sed 's/^/    /'
fi

echo ""

if [[ "$FAILURES" -gt 0 ]]; then
    echo -e "${RED}FAIL:${NC} $FAILURES check(s) failed."
    exit 1
fi

echo -e "${GREEN}All parity checks passed.${NC}"
exit 0
