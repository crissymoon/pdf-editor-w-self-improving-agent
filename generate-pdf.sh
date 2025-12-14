#!/bin/bash

# XCM-PDF Editor - Example PDF Generator Script
# Leto's Angels Educational Project
# Developed by XcaliburMoon Web Development

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "XCM-PDF Editor - Example PDF Generator"
echo "Leto's Angels Educational Project"
echo "XcaliburMoon Web Development"
echo "=========================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Dependencies not installed!${NC}"
    echo -e "${BLUE}Please run ./install.sh first${NC}"
    exit 1
fi

echo -e "${BLUE}Generating example PDF...${NC}"
echo ""

npm run generate-example

echo ""
echo -e "${GREEN}Done!${NC}"
echo ""
echo "The example PDF has been created in the public/ directory"
echo "You can now open it in the PDF editor to test all features"
echo ""
