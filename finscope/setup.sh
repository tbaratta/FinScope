#!/usr/bin/env bash
set -euo pipefail

# FinScope setup script (macOS/Linux)

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT_DIR"

cp -n .env.example .env 2>/dev/null || true

echo "Installing frontend deps..."
(cd frontend && npm install)

echo "Installing Node backend deps..."
(cd backend/node && npm install)

echo "Creating Python venv and installing deps..."
(cd backend/python && python -m venv .venv && . .venv/bin/activate && pip install -U pip && pip install -r requirements.txt)

echo "Done. Start services with:"
echo "  docker-compose up"
echo "Or manually:"
echo "  (cd backend/python && . .venv/bin/activate && uvicorn main:app --reload --port 8000)"
echo "  (cd backend/node && npm start)"
echo "  (cd frontend && npm run dev)"
