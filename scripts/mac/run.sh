#!/bin/bash

# XCM-PDF Editor Run Script
# Leto's Angels Educational Project
# Developed by XcaliburMoon Web Development
# Cross-platform run script for macOS/Linux

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_OS_DIR="$(basename "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=========================================="
echo "XCM-PDF Editor Development Server"
echo "Leto's Angels Educational Project"
echo "XcaliburMoon Web Development"
echo "=========================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Dependencies not installed!${NC}"
    echo -e "${BLUE}Running installation script...${NC}"
    echo ""
    "./scripts/${SCRIPT_OS_DIR}/install.sh"
    echo ""
fi

# Start the development server
echo -e "${BLUE}Starting development server...${NC}"
echo ""
echo -e "${GREEN}The application will open in your default browser${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""
echo "=========================================="
echo ""

npm run dev
