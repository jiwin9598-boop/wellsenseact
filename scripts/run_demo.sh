#!/usr/bin/env bash
set -e
echo "======================================================="
echo "   CalfWatch AI — Automated Demo Launcher"
echo "======================================================="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "Running scripted demo pipeline (no GPU/model required)..."
python main.py --demo

echo ""
echo "Demo finished. State saved to output/state.json."
echo "To launch the Streamlit dashboard, run:"
echo "   streamlit run dashboard/app.py"
echo "======================================================="
