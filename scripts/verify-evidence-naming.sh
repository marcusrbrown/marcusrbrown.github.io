#!/bin/bash
# Lints evidence artifact naming conventions.
# Valid names: task-{N}-{description}.{ext} or files inside final-qa/ subdirectory.

set -u -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
EVIDENCE_DIR="$REPO_ROOT/.sisyphus/evidence"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FAILURES=0
SELF_TEST=false

# Pattern: task-{N}-{description}.{ext}
# N = one or more digits, description = lowercase alphanumeric + hyphens, ext = alphanumeric
VALID_PATTERN='^task-[0-9]+-[a-z0-9][a-z0-9-]*\.[a-zA-Z0-9]+$'

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

print_usage() {
    printf 'Usage: %s [--self-test]\n' "$0"
    printf '  --self-test   Create a temp bad-name fixture and verify it fails\n'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
    --self-test)
        SELF_TEST=true
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

lint_file() {
    local filepath="$1"
    local filename
    filename="$(basename "$filepath")"
    local rel_path="${filepath#$EVIDENCE_DIR/}"

    # Files inside final-qa/ subdirectory are exempt from naming rules
    if [[ "$rel_path" == final-qa/* ]]; then
        print_status 0 "EXEMPT (final-qa/) $rel_path"
        return
    fi

    if echo "$filename" | grep -qE "$VALID_PATTERN"; then
        print_status 0 "OK  $rel_path"
    else
        print_status 1 "BAD $rel_path  (expected: task-{N}-{description}.{ext})"
    fi
}

run_self_test() {
    echo ""
    echo "## Self-test mode"
    local tmpdir
    tmpdir="$(mktemp -d)"
    # shellcheck disable=SC2064
    trap "rm -rf '$tmpdir'" RETURN

    # Create bad-name fixtures
    local bad_files=(
        "badname.txt"
        "task_1_foo.txt"
        "Task-1-foo.txt"
        "task-1-.txt"
        "task--foo.txt"
        "task-1-foo"
    )

    # Create good-name fixtures
    local good_files=(
        "task-1-foo.txt"
        "task-12-some-description.json"
        "task-3-red-phase.txt"
    )

    local self_failures=0

    echo "Testing bad names (each should fail lint):"
    for f in "${bad_files[@]}"; do
        if echo "$f" | grep -qE "$VALID_PATTERN"; then
            echo -e "  ${RED}✗${NC} Self-test FAIL: '$f' should be invalid but passed"
            self_failures=$((self_failures + 1))
        else
            echo -e "  ${GREEN}✓${NC} '$f' correctly rejected"
        fi
    done

    echo ""
    echo "Testing good names (each should pass lint):"
    for f in "${good_files[@]}"; do
        if echo "$f" | grep -qE "$VALID_PATTERN"; then
            echo -e "  ${GREEN}✓${NC} '$f' correctly accepted"
        else
            echo -e "  ${RED}✗${NC} Self-test FAIL: '$f' should be valid but was rejected"
            self_failures=$((self_failures + 1))
        fi
    done

    echo ""
    if [[ "$self_failures" -gt 0 ]]; then
        echo -e "${RED}FAIL:${NC} Self-test found $self_failures issue(s) with the lint pattern."
        exit 1
    fi
    echo -e "${GREEN}Self-test passed.${NC} Lint pattern is correct."
}

echo "Linting evidence artifact naming conventions"
echo "Evidence directory: $EVIDENCE_DIR"
echo "Valid pattern: task-{N}-{description}.{ext} or final-qa/*"
echo "Timestamp (UTC): $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

if [[ "$SELF_TEST" == true ]]; then
    run_self_test
    exit $?
fi

# Check evidence directory exists
if [[ ! -d "$EVIDENCE_DIR" ]]; then
    echo -e "${YELLOW}WARN:${NC} Evidence directory does not exist: $EVIDENCE_DIR"
    echo "      No artifacts to lint."
    exit 0
fi

# Collect all files (non-recursive first level + final-qa/ subdir)
FILES=()
while IFS= read -r -d '' f; do
    FILES+=("$f")
done < <(find "$EVIDENCE_DIR" -maxdepth 2 -type f -print0 | sort -z)

if [[ ${#FILES[@]} -eq 0 ]]; then
    print_info "No evidence files found in $EVIDENCE_DIR"
    exit 0
fi

print_info "Found ${#FILES[@]} evidence file(s)"
echo ""

for f in "${FILES[@]}"; do
    lint_file "$f"
done

echo ""

if [[ "$FAILURES" -gt 0 ]]; then
    echo -e "${RED}FAIL:${NC} $FAILURES file(s) have invalid names."
    exit 1
fi

echo -e "${GREEN}All evidence files pass naming convention.${NC}"
exit 0
