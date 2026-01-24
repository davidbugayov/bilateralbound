#!/bin/bash

# SonarQube Analysis Runner for Bilateral Bound Project
# This script runs SonarQube analysis for both server-core and web-client

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SONARQUBE_HOST="${SONARQUBE_HOST:-http://localhost:9000}"
SONARQUBE_TOKEN="${SONARQUBE_TOKEN:-}"

echo "🚀 Bilateral Bound - SonarQube Analysis"
echo "======================================="
echo ""
echo "Server: $SONARQUBE_HOST"
echo "Token: ${SONARQUBE_TOKEN:-(not set)}"
echo ""

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if SonarQube is running
echo "📡 Checking SonarQube connectivity..."
if ! curl -s "$SONARQUBE_HOST/api/system/status" > /dev/null 2>&1; then
    echo -e "${RED}❌ SonarQube server is not accessible at $SONARQUBE_HOST${NC}"
    echo "Please start SonarQube first:"
    echo "  cd docker && docker-compose up -d sonarqube"
    exit 1
fi
echo -e "${GREEN}✅ SonarQube is running${NC}"
echo ""

# Analyze Web Client
echo "📊 Analyzing: Bilateral Bound - Web Client"
echo "-----------------------------------------"
cd "$PROJECT_ROOT/packages/web-client"

export SONARQUBE_HOST
export SONARQUBE_TOKEN

if npm run lint:sonarqube; then
    echo -e "${GREEN}✅ Web Client analysis completed${NC}"
else
    echo -e "${RED}❌ Web Client analysis failed${NC}"
fi

echo ""

# Analyze Server Core (with warning for authorization)
echo "📊 Analyzing: Bilateral Bound - Server Core"
echo "-----------------------------------------"
cd "$PROJECT_ROOT/packages/server-core"

if npm run lint:sonarqube 2>&1 | grep -q "not authorized"; then
    echo -e "${YELLOW}⚠️  Authorization required for server-core${NC}"
    echo "See docs/SONARQUBE_SERVER_CORE_FIX.md for solutions"
elif npm run lint:sonarqube; then
    echo -e "${GREEN}✅ Server Core analysis completed${NC}"
else
    echo -e "${RED}❌ Server Core analysis failed${NC}"
fi

echo ""
echo "======================================="
echo -e "${GREEN}✅ Analysis complete!${NC}"
echo "View results at: $SONARQUBE_HOST/projects"
