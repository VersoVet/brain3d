#!/bin/bash
# Brain3D Skill Launcher

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${ONYX_PYTHON:-/opt/onyx/venv/bin/python3}"

cd "$SCRIPT_DIR"

export ONYX_CORE_URL="${ONYX_CORE_URL:-http://10.0.0.44:8050}"
export BRAIN3D_PORT="${BRAIN3D_PORT:-8888}"

echo "Starting Brain3D on port $BRAIN3D_PORT..."
echo "Core API: $ONYX_CORE_URL"

exec $PYTHON -m src.main
