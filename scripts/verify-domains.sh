#!/bin/bash
# Verification script for domain HTTP/TLS configuration.
# Checks mrbro.dev, marcusrbrown.com, and marcusrbrown.github.io routing.

set -u -o pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FAILURES=0
CURL_TIMEOUT=15

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

check_http_status() {
    local url="$1"
    local expected_status="$2"
    local description="$3"

    local actual_status
    actual_status=$(curl -sI --max-time "$CURL_TIMEOUT" -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")

    print_info "HTTP $actual_status ← $url"

    if [[ "$actual_status" == "$expected_status" ]]; then
        print_status 0 "$description (HTTP $actual_status)"
    else
        print_status 1 "$description — expected HTTP $expected_status, got $actual_status"
    fi
}

check_tls() {
    local domain="$1"

    local tls_output
    tls_output=$(printf '' | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null |
        openssl x509 -noout -subject -issuer -dates 2>/dev/null || true)

    if [[ -n "$tls_output" ]]; then
        print_status 0 "TLS certificate valid for $domain"
        echo "$tls_output" | sed 's/^/    /'
    else
        print_status 1 "TLS certificate unavailable or invalid for $domain"
    fi
}

check_response_body() {
    local url="$1"
    local pattern="$2"
    local description="$3"

    local body
    body=$(curl -sL --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null || true)

    if echo "$body" | grep -qi "$pattern"; then
        print_status 0 "$description"
    else
        print_status 1 "$description — pattern '$pattern' not found in response body"
    fi
}

echo "Verifying domain HTTP/TLS configuration"
echo "Timestamp (UTC): $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# --- mrbro.dev ---
echo "## mrbro.dev"
check_http_status "https://mrbro.dev" "200" "mrbro.dev returns HTTP 200"
check_tls "mrbro.dev"
echo ""

# --- marcusrbrown.com ---
# Must serve brand site content (not yet deployed — expected to fail)
echo "## marcusrbrown.com"
check_http_status "https://marcusrbrown.com" "200" "marcusrbrown.com returns HTTP 200"
check_tls "marcusrbrown.com"
# Brand site must contain the About section anchor
check_response_body "https://marcusrbrown.com" "id=['\"]about['\"]" \
    "marcusrbrown.com serves brand site content (contains #about anchor)"
echo ""

# --- marcusrbrown.github.io ---
# Should redirect to mrbro.dev after migration
echo "## marcusrbrown.github.io"
GITHUB_IO_STATUS=$(curl -sI --max-time "$CURL_TIMEOUT" -o /dev/null -w '%{http_code}' \
    "https://marcusrbrown.github.io" 2>/dev/null || echo "000")
print_info "HTTP $GITHUB_IO_STATUS ← https://marcusrbrown.github.io"

# After migration, github.io should redirect (301/302) to mrbro.dev
if [[ "$GITHUB_IO_STATUS" == "301" || "$GITHUB_IO_STATUS" == "302" ]]; then
    REDIRECT_LOCATION=$(curl -sI --max-time "$CURL_TIMEOUT" "https://marcusrbrown.github.io" 2>/dev/null |
        grep -i '^location:' | tr -d '\r' | awk '{print $2}')
    print_info "Redirect location: $REDIRECT_LOCATION"
    if echo "$REDIRECT_LOCATION" | grep -q "mrbro.dev"; then
        print_status 0 "marcusrbrown.github.io redirects to mrbro.dev"
    else
        print_status 1 "marcusrbrown.github.io redirects but not to mrbro.dev (got: $REDIRECT_LOCATION)"
    fi
else
    print_status 1 "marcusrbrown.github.io does not redirect (expected 301/302 after migration, got $GITHUB_IO_STATUS)"
fi
check_tls "marcusrbrown.github.io"
echo ""

if [[ "$FAILURES" -gt 0 ]]; then
    echo -e "${RED}FAIL:${NC} $FAILURES check(s) failed."
    exit 1
fi

echo -e "${GREEN}All domain checks passed.${NC}"
exit 0
