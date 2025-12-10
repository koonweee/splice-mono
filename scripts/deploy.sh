#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Deploy Script ===${NC}"

# 1. Fetch and pull latest
echo -e "\n${GREEN}Fetching latest changes...${NC}"
git fetch origin

# Check if there are commits to deploy
COMMITS=$(git log origin/deploy..origin/main --oneline)
if [ -z "$COMMITS" ]; then
    echo -e "${YELLOW}No new commits to deploy. deploy is up to date with main.${NC}"
    exit 0
fi

# 2. Show diffed commits
echo -e "\n${GREEN}Commits to deploy:${NC}"
echo "$COMMITS"
COMMIT_COUNT=$(echo "$COMMITS" | wc -l | xargs)

# Get repo URL for commit links
REPO_URL=$(gh repo view --json url --jq '.url')

# 3. Generate deploy summary
echo -e "\n${GREEN}Generating deploy summary...${NC}"
SUMMARY=$(git log origin/deploy..origin/main --pretty=format:"- %s ([%h](${REPO_URL}/commit/%H))")

echo -e "\n${YELLOW}Summary:${NC}"
echo "$SUMMARY"

# 4. Create PR and auto-merge
echo -e "\n${GREEN}Creating PR...${NC}"

PR_TITLE="Deploy: $COMMIT_COUNT commit(s) to production"
PR_BODY="## Changes
$SUMMARY"

# Create PR using gh CLI
PR_URL=$(gh pr create \
    --base deploy \
    --head main \
    --title "$PR_TITLE" \
    --body "$PR_BODY" \
    2>&1) || {
    # Check if PR already exists
    if echo "$PR_URL" | grep -q "already exists"; then
        echo -e "${YELLOW}PR already exists. Finding it...${NC}"
        PR_URL=$(gh pr list --base deploy --head main --json url --jq '.[0].url')
        echo -e "Existing PR: $PR_URL"
    else
        echo -e "${RED}Failed to create PR: $PR_URL${NC}"
        exit 1
    fi
}

echo -e "PR created: $PR_URL"

# Wait for CI checks to pass
echo -e "\n${GREEN}Waiting for CI checks to pass...${NC}"
if ! gh pr checks "$PR_URL" --watch --fail-fast; then
    echo -e "${RED}CI checks failed. Aborting deploy.${NC}"
    exit 1
fi

# Auto-merge the PR
echo -e "\n${GREEN}Merging PR...${NC}"
gh pr merge --merge "$PR_URL"

echo -e "\n${GREEN}=== Deploy complete! ===${NC}"
