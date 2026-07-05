@echo off
setlocal enabledelayedexpansion
REM ==========================================================================
REM  kill-ports.bat  -  free dev ports by killing whatever is listening on them
REM
REM  Usage:
REM    kill-ports.bat            free ports 3000-3010 (default dev range)
REM    kill-ports.bat 3000 5173  free only the ports you pass
REM    kill-ports.bat all        free 3000-3010 AND kill every node.exe
REM
REM  No admin needed for your own dev processes. Double-click to run, or call
REM  it from a terminal.
REM ==========================================================================

set "KILL_NODE="
set "PORTS="

if /I "%~1"=="all" (
  set "KILL_NODE=1"
) else if not "%~1"=="" (
  set "PORTS=%*"
)

if not defined PORTS (
  for /L %%p in (3000,1,3010) do set "PORTS=!PORTS! %%p"
)

echo Freeing ports:!PORTS!
set "FOUND="
for %%P in (!PORTS!) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /C:":%%P " ^| findstr "LISTENING"') do (
    echo   killing PID %%A on port %%P
    taskkill /F /PID %%A >nul 2>&1
    set "FOUND=1"
  )
)
if not defined FOUND echo   (nothing was listening on those ports)

if defined KILL_NODE (
  echo Killing all node.exe ...
  taskkill /F /IM node.exe >nul 2>&1
)

echo Done.
endlocal
