#!/usr/bin/env bash
# QP Page Finder - Linux launcher. Double-click or run: ./START-HERE.sh
cd "$(dirname "$0")" || exit 1
echo ""
echo "  QP Page Finder - starting local server..."
echo "  Keep this window open while you use the app."
echo ""
if command -v python3 >/dev/null 2>&1; then
  python3 server.py
elif command -v node >/dev/null 2>&1; then
  node server.js
else
  echo "  Neither Python 3 nor Node.js was found. Install one of them,"
  echo "  then run this file again. All other dependencies are bundled."
  echo ""
  read -r -p "Press Enter to close..." _
  exit 1
fi
echo ""
read -r -p "Server stopped. Press Enter to close..." _
