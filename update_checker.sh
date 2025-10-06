#!/bin/bash

# EMDR Bilateral Update Checker
# Checks for new commits in GitHub repository and triggers deployment

set -e

# Configuration
GITHUB_REPO="davidbugayov/bilateralbound"
BRANCH="stable"
LAST_COMMIT_FILE="/var/www/html/last_commit.txt"
DEPLOY_SCRIPT="/var/www/html/deploy.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Get latest commit hash from GitHub API
get_latest_commit() {
    if command -v curl &> /dev/null; then
        curl -s "https://api.github.com/repos/$GITHUB_REPO/commits/$BRANCH" | \
        jq -r '.sha' 2>/dev/null || echo ""
    elif command -v wget &> /dev/null; then
        wget -q -O - "https://api.github.com/repos/$GITHUB_REPO/commits/$BRANCH" | \
        jq -r '.sha' 2>/dev/null || echo ""
    else
        error "Neither curl nor wget available"
        exit 1
    fi
}

# Main logic
main() {
    log "🔍 Checking for updates in EMDR Bilateral repository..."

    # Get current commit
    if [ -f "$LAST_COMMIT_FILE" ]; then
        CURRENT_COMMIT=$(cat "$LAST_COMMIT_FILE")
        info "Current commit: $CURRENT_COMMIT"
    else
        CURRENT_COMMIT=""
        info "No previous commit found"
    fi

    # Get latest commit from GitHub
    LATEST_COMMIT=$(get_latest_commit)

    if [ -z "$LATEST_COMMIT" ]; then
        error "Failed to get latest commit from GitHub"
        exit 1
    fi

    info "Latest commit: $LATEST_COMMIT"

    # Check if update is needed
    if [ "$CURRENT_COMMIT" = "$LATEST_COMMIT" ]; then
        log "✅ Repository is up to date"
        exit 0
    else
        log "🔄 New version detected! Deploying..."
        echo "$LATEST_COMMIT" > "$LAST_COMMIT_FILE"

        # Run deployment script
        if [ -x "$DEPLOY_SCRIPT" ]; then
            bash "$DEPLOY_SCRIPT"
        else
            error "Deploy script not found or not executable: $DEPLOY_SCRIPT"
            exit 1
        fi
    fi
}

# Run main function
main "$@"
