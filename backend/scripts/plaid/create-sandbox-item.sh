#!/bin/bash
# Creates a Plaid sandbox item and saves the access token for reuse
# Usage: ./create-sandbox-item.sh
#
# Required environment variables:
#   PLAID_SANDBOX_CLIENT_ID - Your Plaid sandbox client ID
#   PLAID_SANDBOX_SECRET    - Your Plaid sandbox secret

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TOKEN_FILE="$HOME/.plaid-sandbox-token"
PLAID_SANDBOX_URL="https://sandbox.plaid.com"

# Check for required environment variables
if [ -z "$PLAID_SANDBOX_CLIENT_ID" ] || [ -z "$PLAID_SANDBOX_SECRET" ]; then
    echo -e "${RED}Error: Missing required environment variables${NC}"
    echo "Please set:"
    echo "  export PLAID_SANDBOX_CLIENT_ID='your_client_id'"
    echo "  export PLAID_SANDBOX_SECRET='your_secret'"
    exit 1
fi

echo -e "${YELLOW}Creating sandbox item...${NC}"

# Step 1: Create a public token using sandbox/public_token/create
echo "Step 1: Creating public token..."
PUBLIC_TOKEN_RESPONSE=$(curl -s -X POST "$PLAID_SANDBOX_URL/sandbox/public_token/create" \
    -H "Content-Type: application/json" \
    -d "{
        \"client_id\": \"$PLAID_SANDBOX_CLIENT_ID\",
        \"secret\": \"$PLAID_SANDBOX_SECRET\",
        \"institution_id\": \"ins_109508\",
        \"initial_products\": [\"transactions\"],
        \"options\": {
            \"webhook\": \"https://splice-api.jtkw.me/bank-link/webhook/plaid\"
        }
    }")

# Check for errors
if echo "$PUBLIC_TOKEN_RESPONSE" | grep -q "error_code"; then
    echo -e "${RED}Error creating public token:${NC}"
    echo "$PUBLIC_TOKEN_RESPONSE" | jq .
    exit 1
fi

PUBLIC_TOKEN=$(echo "$PUBLIC_TOKEN_RESPONSE" | jq -r '.public_token')
echo -e "  Public token: ${GREEN}${PUBLIC_TOKEN:0:20}...${NC}"

# Step 2: Exchange public token for access token
echo "Step 2: Exchanging for access token..."
EXCHANGE_RESPONSE=$(curl -s -X POST "$PLAID_SANDBOX_URL/item/public_token/exchange" \
    -H "Content-Type: application/json" \
    -d "{
        \"client_id\": \"$PLAID_SANDBOX_CLIENT_ID\",
        \"secret\": \"$PLAID_SANDBOX_SECRET\",
        \"public_token\": \"$PUBLIC_TOKEN\"
    }")

# Check for errors
if echo "$EXCHANGE_RESPONSE" | grep -q "error_code"; then
    echo -e "${RED}Error exchanging token:${NC}"
    echo "$EXCHANGE_RESPONSE" | jq .
    exit 1
fi

ACCESS_TOKEN=$(echo "$EXCHANGE_RESPONSE" | jq -r '.access_token')
ITEM_ID=$(echo "$EXCHANGE_RESPONSE" | jq -r '.item_id')

# Save access token to file
echo "$ACCESS_TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

echo ""
echo -e "${GREEN}Success!${NC}"
echo -e "  Item ID: $ITEM_ID"
echo -e "  Access token saved to: $TOKEN_FILE"
echo ""
echo "You can now use fire-webhook.sh to trigger webhooks for this item."
