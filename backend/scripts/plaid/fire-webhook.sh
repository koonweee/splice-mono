#!/bin/bash
# Fires a DEFAULT_UPDATE webhook to your server using a saved sandbox item
# Usage: ./fire-webhook.sh [webhook_url]
#
# Required environment variables:
#   PLAID_SANDBOX_CLIENT_ID - Your Plaid sandbox client ID
#   PLAID_SANDBOX_SECRET    - Your Plaid sandbox secret
#
# Optional arguments:
#   webhook_url - Override the default webhook URL

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

TOKEN_FILE="$HOME/.plaid-sandbox-token"
PLAID_SANDBOX_URL="https://sandbox.plaid.com"
DEFAULT_WEBHOOK_URL="https://splice-api.jtkw.me/bank-link/webhook/plaid"

# Use provided webhook URL or default
WEBHOOK_URL="${1:-$DEFAULT_WEBHOOK_URL}"

# Check for required environment variables
if [ -z "$PLAID_SANDBOX_CLIENT_ID" ] || [ -z "$PLAID_SANDBOX_SECRET" ]; then
    echo -e "${RED}Error: Missing required environment variables${NC}"
    echo "Please set:"
    echo "  export PLAID_SANDBOX_CLIENT_ID='your_client_id'"
    echo "  export PLAID_SANDBOX_SECRET='your_secret'"
    exit 1
fi

# Check for saved access token
if [ ! -f "$TOKEN_FILE" ]; then
    echo -e "${RED}Error: No access token found at $TOKEN_FILE${NC}"
    echo "Please run create-sandbox-item.sh first to create an item."
    exit 1
fi

ACCESS_TOKEN=$(cat "$TOKEN_FILE")

echo -e "${YELLOW}Firing DEFAULT_UPDATE webhook...${NC}"
echo -e "  Webhook URL: ${CYAN}$WEBHOOK_URL${NC}"

# Fire the webhook
RESPONSE=$(curl -s -X POST "$PLAID_SANDBOX_URL/sandbox/item/fire_webhook" \
    -H "Content-Type: application/json" \
    -d "{
        \"client_id\": \"$PLAID_SANDBOX_CLIENT_ID\",
        \"secret\": \"$PLAID_SANDBOX_SECRET\",
        \"access_token\": \"$ACCESS_TOKEN\",
        \"webhook_type\": \"TRANSACTIONS\",
        \"webhook_code\": \"DEFAULT_UPDATE\"
    }")

# Check for errors
if echo "$RESPONSE" | grep -q "error_code"; then
    echo -e "${RED}Error firing webhook:${NC}"
    echo "$RESPONSE" | jq .
    exit 1
fi

echo ""
echo -e "${GREEN}Webhook fired successfully!${NC}"
echo "$RESPONSE" | jq .
echo ""
echo "Check your server logs for the incoming webhook."
