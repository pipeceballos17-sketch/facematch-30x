@echo off
cd /d "%~dp0"
echo Starting Facematch 30X Backend...
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
