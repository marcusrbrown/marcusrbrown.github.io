#!/bin/bash
# Verification script for brand site required sections.
# Checks HTML structure, section content, and canonical URL.

set -u -o pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FAILURES=0
CURL_TIMEOUT=15
DEFAULT_URL="http://localhost:5173"
TARGET_URL="$DEFAULT_URL"
EXPECTED_CANONICAL="https://marcusrbrown.com/"
MIN_SECTION_CHARS=120

# Required section anchors per IA contract
REQUIRED_SECTIONS=("about" "experience" "skills" "contact")

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
    printf 'Usage: %s [--url <url>]\n' "$0"
    printf '  --url   Base URL to check (default: %s)\n' "$DEFAULT_URL"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
    --url)
        if [[ $# -lt 2 ]]; then
            print_usage
            exit 2
        fi
        TARGET_URL="$2"
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

echo "Verifying brand site sections"
echo "Target URL: $TARGET_URL"
echo "Timestamp (UTC): $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# Fetch the page HTML once
HTML=$(curl -sL --max-time "$CURL_TIMEOUT" "$TARGET_URL" 2>/dev/null || true)

if [[ -z "$HTML" ]]; then
    echo -e "${RED}ERROR:${NC} Could not fetch $TARGET_URL — server not responding or URL unreachable." >&2
    echo "       Start the brand site dev server before running this check."
    exit 1
fi

print_status 0 "Fetched HTML from $TARGET_URL ($(echo "$HTML" | wc -c | tr -d ' ') bytes)"
echo ""

# Check 1: Required section anchors present
echo "## Section anchor checks"
for section in "${REQUIRED_SECTIONS[@]}"; do
    # Match id="section" or id='section'
    if echo "$HTML" | grep -qiE "id=['\"]${section}['\"]"; then
        print_status 0 "Section anchor #${section} present"
    else
        print_status 1 "Section anchor #${section} missing"
    fi
done
echo ""

# Check 2: Each section has non-empty content (> MIN_SECTION_CHARS chars)
echo "## Section content checks (min ${MIN_SECTION_CHARS} chars each)"
for section in "${REQUIRED_SECTIONS[@]}"; do
    # Extract content between the section id and the next section id (or end of body)
    # Use Python for reliable multi-line extraction if available, else fall back to awk
    if command -v python3 >/dev/null 2>&1; then
        SECTION_CONTENT=$(
            python3 - "$section" <<'PYEOF'
import sys, re

section = sys.argv[1]
import sys

html = sys.stdin.read()
# Find the section element by id
pattern = re.compile(
    r'id=["\']' + re.escape(section) + r'["\'].*?(?=id=["\'][a-z]+["\']|</body>|$)',
    re.IGNORECASE | re.DOTALL
)
m = pattern.search(html)
if m:
    # Strip tags to get text content
    text = re.sub(r'<[^>]+>', ' ', m.group(0))
    text = re.sub(r'\s+', ' ', text).strip()
    print(text)
PYEOF
            <<<"$HTML"
        )
    else
        # Fallback: rough awk extraction
        SECTION_CONTENT=$(echo "$HTML" | awk "
            /id=['\"]${section}['\"]/{found=1}
            found{buf=buf\$0}
            found && /id=['\"][a-z]+['\"]/ && !/id=['\"]${section}['\"]/{found=0}
            END{print buf}
        ")
    fi

    CONTENT_LEN=${#SECTION_CONTENT}
    print_info "#${section} extracted content length: ${CONTENT_LEN} chars"

    if [[ "$CONTENT_LEN" -gt "$MIN_SECTION_CHARS" ]]; then
        print_status 0 "#${section} has sufficient content (${CONTENT_LEN} > ${MIN_SECTION_CHARS} chars)"
    else
        print_status 1 "#${section} content too short or empty (${CONTENT_LEN} ≤ ${MIN_SECTION_CHARS} chars)"
    fi
done
echo ""

# Check 3: Canonical URL
echo "## Canonical URL check"
if echo "$HTML" | grep -qi "rel=['\"]canonical['\"]"; then
    CANONICAL=$(echo "$HTML" | grep -oi "rel=['\"]canonical['\"][^>]*href=['\"][^'\"]*['\"]" |
        grep -oi "href=['\"][^'\"]*['\"]" |
        sed "s/href=['\"]//;s/['\"]$//" |
        head -1)
    # Also try href-before-rel order
    if [[ -z "$CANONICAL" ]]; then
        CANONICAL=$(echo "$HTML" | grep -oi "href=['\"][^'\"]*['\"][^>]*rel=['\"]canonical['\"]" |
            grep -oi "href=['\"][^'\"]*['\"]" |
            sed "s/href=['\"]//;s/['\"]$//" |
            head -1)
    fi
    print_info "Canonical URL found: $CANONICAL"
    if [[ "$CANONICAL" == "$EXPECTED_CANONICAL" ]]; then
        print_status 0 "Canonical URL is $EXPECTED_CANONICAL"
    else
        print_status 1 "Canonical URL mismatch — expected '$EXPECTED_CANONICAL', got '$CANONICAL'"
    fi
else
    print_status 1 "No canonical link tag found in HTML"
fi
echo ""

if [[ "$FAILURES" -gt 0 ]]; then
    echo -e "${RED}FAIL:${NC} $FAILURES check(s) failed."
    exit 1
fi

echo -e "${GREEN}All brand section checks passed.${NC}"
exit 0
