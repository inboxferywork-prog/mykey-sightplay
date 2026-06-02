#!/bin/bash
# update-index.sh — macOS/Linux helper to regenerate songs/index.json
#
# Usage:
#   1. chmod +x tools/update-index.sh  (one-time setup)
#   2. ./tools/update-index.sh
#   OR
#   3. python tools/update_song_index.py
#
# What it does:
#   - Scans songs/ folder for all *.json files
#   - Regenerates songs/index.json with metadata
#   - Preserves curation fields (listed, collectionId, tags)

set -e

# Get project root (script's parent directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo ""
echo "========================================"
echo "  MyKey Song Index Updater"
echo "========================================"
echo ""

# Check if songs/ folder exists
if [ ! -d "songs" ]; then
    echo "ERROR: songs/ folder not found"
    echo "Please run this script from project root"
    exit 1
fi

echo "Scanning songs/ folder..."
python3 tools/update_song_index.py

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✓ Success! index.json has been regenerated."
    echo ""
    echo "Next steps:"
    echo "  - Reload song browser in your app"
    echo "  - New songs will appear in the library"
else
    echo "✗ Error occurred. Check the messages above."
fi
echo ""

exit $EXIT_CODE
