#!/bin/bash
# Verification script for mrbro.dev repository bootstrap
# Checks that ../mrbro.dev is a valid git repo with correct remote

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET_REPO="$REPO_ROOT/../mrbro.dev"
EXPECTED_REMOTE="github.com/marcusrbrown/mrbro.dev"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
NEGATIVE_TEST=false
if [[ "$1" == "--negative" ]]; then
    NEGATIVE_TEST=true
fi

# Function to print status
print_status() {
    local status=$1
    local message=$2
    if [[ $status -eq 0 ]]; then
        echo -e "${GREEN}✓${NC} $message"
    else
        echo -e "${RED}✗${NC} $message"
    fi
}

# Function to print error and exit
error_exit() {
    echo -e "${RED}ERROR:${NC} $1" >&2
    exit 1
}

echo "Verifying mrbro.dev repository bootstrap..."
echo "Target repo: $TARGET_REPO"
echo ""

# Check 1: Directory exists
if [[ ! -d "$TARGET_REPO" ]]; then
    error_exit "Target directory does not exist: $TARGET_REPO"
fi
print_status 0 "Target directory exists"

# Check 2: Is a git repository
if ! git -C "$TARGET_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    error_exit "Target directory is not a git repository"
fi
print_status 0 "Target is a valid git repository"

# Check 3: Has correct remote URL
ACTUAL_REMOTE=$(git -C "$TARGET_REPO" remote get-url origin 2>/dev/null || echo "")
if [[ -z "$ACTUAL_REMOTE" ]]; then
    error_exit "No remote 'origin' found in repository"
fi
print_status 0 "Remote 'origin' exists: $ACTUAL_REMOTE"

# Check 4: Remote URL contains expected domain
if [[ "$ACTUAL_REMOTE" == *"$EXPECTED_REMOTE"* ]]; then
    print_status 0 "Remote URL contains expected domain: $EXPECTED_REMOTE"
else
    error_exit "Remote URL does not contain expected domain. Expected: $EXPECTED_REMOTE, Got: $ACTUAL_REMOTE"
fi

echo ""

# Negative test: Verify against wrong URL
if [[ "$NEGATIVE_TEST" == true ]]; then
    echo "Running negative test (should fail with wrong URL)..."
    WRONG_REMOTE="github.com/wrong/repo"

    if [[ "$ACTUAL_REMOTE" == *"$WRONG_REMOTE"* ]]; then
        error_exit "Negative test failed: Remote should NOT contain $WRONG_REMOTE"
    fi
    print_status 0 "Negative test passed: Remote does not contain wrong URL ($WRONG_REMOTE)"
    echo ""
fi

echo -e "${GREEN}All checks passed!${NC}"
echo "Repository bootstrap verification successful."
exit 0
