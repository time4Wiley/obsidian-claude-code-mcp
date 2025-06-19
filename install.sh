#!/bin/bash

# Install script for Obsidian Claude Code MCP plugin
# Copies built plugin files to personal Obsidian vault

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Target directory
TARGET_DIR="$HOME/kb/Personal/.obsidian/plugins/claude-code-mcp"

# Required files
REQUIRED_FILES=("main.js" "manifest.json" "styles.css")

# Check if all required files exist
echo "Checking for required files..."
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}Error: $file not found. Please run 'bun run build' first.${NC}"
        exit 1
    fi
done

# Create target directory if it doesn't exist
echo "Creating target directory..."
mkdir -p "$TARGET_DIR"

# Copy files
echo "Installing plugin to $TARGET_DIR..."
for file in "${REQUIRED_FILES[@]}"; do
    cp "$file" "$TARGET_DIR/"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Copied $file${NC}"
    else
        echo -e "${RED}✗ Failed to copy $file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}Plugin installed successfully!${NC}"
echo "You may need to reload Obsidian or enable the plugin in Settings > Community plugins"