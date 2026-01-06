#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/remove-plaid-items.sh <all_tokens_csv> <prod_tokens_csv> [--dry-run]

Removes Plaid items for access_tokens present in the first CSV but missing
from the second CSV. Requires PLAID_CLIENT_ID and PLAID_SECRET in .env.
USAGE
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage
  exit 1
fi

ALL_TOKENS_CSV="$1"
PROD_TOKENS_CSV="$2"
DRY_RUN="${3:-}"

if [[ "$DRY_RUN" != "" && "$DRY_RUN" != "--dry-run" ]]; then
  usage
  exit 1
fi

ENV_PATH=""
if [[ -f ".env" ]]; then
  ENV_PATH=".env"
elif [[ -f "backend/.env" ]]; then
  ENV_PATH="backend/.env"
fi

if [[ -z "$ENV_PATH" ]]; then
  echo "Missing .env in repo root or backend/.env. Create one with Plaid credentials."
  exit 1
fi

set -a
source "$ENV_PATH"
set +a

if [[ -z "${PLAID_CLIENT_ID:-}" || -z "${PLAID_SECRET:-}" ]]; then
  echo "PLAID_CLIENT_ID and PLAID_SECRET must be set in .env."
  exit 1
fi

PLAID_BASE_URL="https://production.plaid.com"

extract_tokens() {
  local csv_path="$1"
  python3 - "$csv_path" <<'PY'
import csv
import sys

path = sys.argv[1]
with open(path, newline="") as f:
    reader = csv.reader(f)
    header = next(reader, None)
    if not header:
        sys.exit(0)
    idx = None
    for name in ("access_tokens", "access_token"):
        try:
            idx = header.index(name)
            break
        except ValueError:
            pass
    if idx is None:
        print(f"Missing access_tokens/access_token column in {path}", file=sys.stderr)
        sys.exit(2)
    for row in reader:
        if idx < len(row):
            token = row[idx].strip()
            if token:
                print(token)
PY
}

tmp_all="$(mktemp)"
tmp_prod="$(mktemp)"
tmp_missing="$(mktemp)"
cleanup() {
  rm -f "$tmp_all" "$tmp_prod" "$tmp_missing"
}
trap cleanup EXIT

extract_tokens "$ALL_TOKENS_CSV" | sort -u > "$tmp_all"
extract_tokens "$PROD_TOKENS_CSV" | sort -u > "$tmp_prod"

comm -23 "$tmp_all" "$tmp_prod" > "$tmp_missing"

all_count="$(wc -l < "$tmp_all" | tr -d ' ')"
prod_count="$(wc -l < "$tmp_prod" | tr -d ' ')"
missing_count="$(wc -l < "$tmp_missing" | tr -d ' ')"
echo "Token counts - plaid: $all_count, prod: $prod_count, diff: $missing_count"
echo "Tokens to remove: $missing_count"

if [[ "$missing_count" -eq 0 ]]; then
  exit 0
fi

if [[ "$DRY_RUN" != "--dry-run" ]]; then
  echo "Proceed with removing $missing_count items from Plaid? (yes/no)"
  read -r confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

curl_headers=(-H "Content-Type: application/json")

while IFS= read -r access_token; do
  token_suffix="${access_token: -6}"
  if [[ "$DRY_RUN" == "--dry-run" ]]; then
    echo "DRY RUN: would remove item for token ending in $token_suffix"
    continue
  fi

  payload=$(cat <<JSON
{"client_id":"${PLAID_CLIENT_ID}","secret":"${PLAID_SECRET}","access_token":"${access_token}"}
JSON
)

  response="$(curl -sS -w "\n%{http_code}" -X POST "${curl_headers[@]}" \
    -d "$payload" \
    "${PLAID_BASE_URL}/item/remove")"
  body="${response%$'\n'*}"
  code="${response##*$'\n'}"

  if [[ "$code" -ge 200 && "$code" -lt 300 ]]; then
    echo "Removed item for token ending in $token_suffix"
  else
    echo "Failed to remove token ending in $token_suffix (HTTP $code)"
    echo "$body"
  fi
done < "$tmp_missing"
