#!/usr/bin/env bash

set -u -o pipefail

DOMAINS=(
    "mrbro.dev"
    "marcusrbrown.com"
    "www.marcusrbrown.com"
    "marcusrbrown.github.io"
)

RECORD_TYPES=("A" "AAAA" "CNAME" "TXT" "CAA")
CHALLENGE_RECORD="_github-pages-challenge-marcusrbrown.marcusrbrown.com"
CHALLENGE_TYPE="TXT"

COMPARE_MODE=0
BASELINE_FILE=".sisyphus/evidence/task-1-dns-baseline.txt"
HAS_NXDOMAIN=0

CURRENT_SUMMARY_FILE="$(mktemp)"
BASELINE_SUMMARY_FILE="$(mktemp)"

cleanup() {
    rm -f "$CURRENT_SUMMARY_FILE" "$BASELINE_SUMMARY_FILE"
}

trap cleanup EXIT

print_usage() {
    printf 'Usage: %s [--compare] [--baseline <path>]\n' "$0"
}

extract_status() {
    local raw_output="$1"
    local status

    status="$(printf '%s\n' "$raw_output" | grep -m1 -Eo 'status: [A-Z]+' | cut -d' ' -f2)"
    if [[ -z "$status" ]]; then
        status="UNKNOWN"
    fi

    printf '%s\n' "$status"
}

extract_answers() {
    local name="$1"
    local type="$2"
    local answers

    answers="$(dig +short "$name" "$type" | paste -sd ';' -)"
    if [[ -z "$answers" ]]; then
        answers="<empty>"
    fi

    printf '%s\n' "$answers"
}

capture_query() {
    local name="$1"
    local type="$2"
    local required="$3"
    local raw status answers

    raw="$(dig "$name" "$type")"
    status="$(extract_status "$raw")"
    answers="$(extract_answers "$name" "$type")"

    printf '## dig %s %s\n' "$name" "$type"
    printf '%s\n\n' "$raw"

    printf 'SUMMARY|%s|%s|%s|%s\n\n' "$name" "$type" "$status" "$answers"
    printf 'SUMMARY|%s|%s|%s|%s\n' "$name" "$type" "$status" "$answers" >>"$CURRENT_SUMMARY_FILE"

    if [[ "$required" -eq 1 && "$status" == "NXDOMAIN" ]]; then
        HAS_NXDOMAIN=1
    fi
}

capture_http_and_tls() {
    local domain="$1"
    local headers tls_output

    printf '## curl -sI https://%s/\n' "$domain"
    if headers="$(curl -sI --max-time 15 "https://${domain}/")"; then
        printf '%s\n\n' "$headers"
    else
        printf 'curl request failed for https://%s/\n\n' "$domain"
    fi

    printf '## openssl s_client cert summary for %s\n' "$domain"
    tls_output="$(printf '' | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null | openssl x509 -noout -subject -issuer -dates 2>/dev/null)"

    if [[ -n "$tls_output" ]]; then
        printf '%s\n\n' "$tls_output"
    else
        printf 'TLS certificate summary unavailable for %s\n\n' "$domain"
    fi
}

compare_with_baseline() {
    if [[ ! -f "$BASELINE_FILE" ]]; then
        printf 'Baseline file not found: %s\n' "$BASELINE_FILE"
        return 1
    fi

    grep '^SUMMARY|' "$BASELINE_FILE" >"$BASELINE_SUMMARY_FILE" || true

    printf '## Baseline comparison\n'
    if diff -u "$BASELINE_SUMMARY_FILE" "$CURRENT_SUMMARY_FILE"; then
        printf 'No summary-level DNS changes detected.\n\n'
    else
        printf 'Summary-level DNS differences detected (see diff above).\n\n'
    fi
}

while [[ $# -gt 0 ]]; do
    case "$1" in
    --compare)
        COMPARE_MODE=1
        shift
        ;;
    --baseline)
        if [[ $# -lt 2 ]]; then
            print_usage
            exit 2
        fi
        BASELINE_FILE="$2"
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

printf '# DNS Verification Snapshot\n'
printf '# Timestamp (UTC): %s\n\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

for domain in "${DOMAINS[@]}"; do
    printf '# Domain: %s\n\n' "$domain"

    for record_type in "${RECORD_TYPES[@]}"; do
        capture_query "$domain" "$record_type" 1
    done

    capture_http_and_tls "$domain"
done

printf '# GitHub Pages Challenge Record\n\n'
capture_query "$CHALLENGE_RECORD" "$CHALLENGE_TYPE" 0

if [[ "$COMPARE_MODE" -eq 1 ]]; then
    compare_with_baseline || exit 1
fi

if [[ "$HAS_NXDOMAIN" -eq 1 ]]; then
    printf 'One or more required domain record queries returned NXDOMAIN.\n'
    exit 1
fi

exit 0
