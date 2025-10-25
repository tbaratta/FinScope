#!/usr/bin/env pwsh
# FinScope setup script (Windows PowerShell)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path .env) -and (Test-Path .env.example)) {
  Copy-Item .env.example .env
}

Write-Host "Installing frontend deps..."
Push-Location frontend
npm install
Pop-Location

Write-Host "Installing Node backend deps..."
Push-Location backend\node
npm install
Pop-Location

Write-Host "Creating Python venv and installing deps..."
Push-Location backend\python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Pop-Location

Write-Host "Done. Start services with:" -ForegroundColor Green
Write-Host "  docker-compose up"
Write-Host "Or manually:" -ForegroundColor Green
Write-Host "  (cd backend/python ; . ./.venv/Scripts/Activate.ps1 ; uvicorn main:app --reload --port 8000)"
Write-Host "  (cd backend/node ; npm start)"
Write-Host "  (cd frontend ; npm run dev)"
