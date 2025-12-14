#!/bin/bash

# XCM-PDF Editor Installation Script
# Leto's Angels Educational Project
# Developed by XcaliburMoon Web Development
# Cross-platform installation for macOS/Linux

set -e

echo "=========================================="
echo "XCM-PDF Editor Installation"
echo "Leto's Angels Educational Project"
echo "XcaliburMoon Web Development"
echo "=========================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for Node.js
echo -e "${BLUE}[1/4] Checking Node.js installation...${NC}"
if command_exists node; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}Node.js is installed: $NODE_VERSION${NC}"
    
    # Check if version is >= 16
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -lt 16 ]; then
        echo -e "${YELLOW}Warning: Node.js version 16 or higher is recommended${NC}"
        echo -e "${YELLOW}Current version: $NODE_VERSION${NC}"
    fi
else
    echo -e "${RED}Node.js is not installed!${NC}"
    echo ""
    echo "Please install Node.js from one of the following sources:"
    echo "  - Official website: https://nodejs.org/"
    echo "  - Using nvm (recommended):"
    echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "    nvm install --lts"
    echo ""
    exit 1
fi

# Check for npm
echo -e "${BLUE}[2/4] Checking npm installation...${NC}"
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}npm is installed: v$NPM_VERSION${NC}"
else
    echo -e "${RED}npm is not installed!${NC}"
    echo "npm should come with Node.js. Please reinstall Node.js."
    exit 1
fi

# Clean installation
echo ""
echo -e "${BLUE}[3/4] Cleaning previous installation...${NC}"
if [ -d "node_modules" ]; then
    echo "Removing existing node_modules directory..."
    rm -rf node_modules
fi
if [ -f "package-lock.json" ]; then
    echo "Removing existing package-lock.json..."
    rm -f package-lock.json
fi

# Install dependencies
echo ""
echo -e "${BLUE}[4/4] Installing dependencies...${NC}"
echo "This may take a few minutes..."
npm install

# Verify installation
echo ""
echo -e "${BLUE}Verifying installation...${NC}"
if [ -d "node_modules" ]; then
    echo -e "${GREEN}Dependencies installed successfully!${NC}"
else
    echo -e "${RED}Installation failed!${NC}"
    exit 1
fi

# Success message
echo ""
echo "=========================================="
echo -e "${GREEN}Installation Complete!${NC}"
echo "=========================================="
echo ""
echo "To start the development server, run:"
echo -e "  ${YELLOW}./run.sh${NC}  or  ${YELLOW}npm run dev${NC}"
echo ""
echo "To build for production, run:"
echo -e "  ${YELLOW}npm run build${NC}"
echo ""
echo "To preview production build, run:"
echo -e "  ${YELLOW}npm run preview${NC}"
echo ""
echo "=========================================="
