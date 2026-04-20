@echo off
setlocal enabledelayedexpansion

REM TinyGame Arena - Windows Installer
REM Installs Node and Python dependencies for both services.

echo ==========================================
echo   TinyGame Arena - Dependency Installer
echo ==========================================

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js wurde nicht gefunden. Bitte Node 18+ installieren.
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python wurde nicht gefunden. Bitte Python 3.10+ installieren.
  exit /b 1
)

echo.
echo [1/2] Installiere Node-Abhaengigkeiten ...
pushd node-realtime
call npm install
if errorlevel 1 (
  echo [ERROR] npm install fehlgeschlagen.
  popd
  exit /b 1
)
popd

echo.
echo [2/2] Installiere Python-Abhaengigkeiten ...
pushd flask-backend
if not exist .venv (
  python -m venv .venv
  if errorlevel 1 (
    echo [ERROR] Erstellen der virtuellen Umgebung fehlgeschlagen.
    popd
    exit /b 1
  )
)

call .venv\Scripts\activate
if errorlevel 1 (
  echo [ERROR] Aktivieren der virtuellen Umgebung fehlgeschlagen.
  popd
  exit /b 1
)

python -m pip install --upgrade pip
if errorlevel 1 (
  echo [ERROR] pip Upgrade fehlgeschlagen.
  popd
  exit /b 1
)

pip install -r requirements.txt
if errorlevel 1 (
  echo [ERROR] pip install fehlgeschlagen.
  popd
  exit /b 1
)

popd

echo.
echo [DONE] Installation abgeschlossen.
echo Starte danach in zwei Terminals:
echo   1^) cd node-realtime ^&^& npm run start
echo   2^) cd flask-backend ^&^& .venv\Scripts\activate ^&^& python app.py

exit /b 0
